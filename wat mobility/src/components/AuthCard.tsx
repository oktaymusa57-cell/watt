/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, User, Lock, Key, ArrowRight, ArrowLeft, Send, Check, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { db, hashPassword, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, query, where, getDocs, updateDoc, deleteField, collection } from 'firebase/firestore';
import { useToast } from './Toast';
import { sendResetEmail } from '../lib/emailjs';
import { logger } from '../lib/logger';
import { OperationType } from '../types';

type AuthFormType = 'login' | 'signup' | 'forgot' | 'reset';

interface AuthCardProps {
  onAuthSuccess: (email: string, username: string) => void;
}

export default function AuthCard({ onAuthSuccess }: AuthCardProps) {
  const [formType, setFormType] = useState<AuthFormType>('login');
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  // Form states
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Forgot Password / Reset dynamics
  const [validatedResetEmail, setValidatedResetEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Parse reset parameters from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const emailParam = urlParams.get('email');

    if (token && emailParam) {
      verifyResetToken(emailParam, token);
    }
  }, []);

  // Countdown timer for password reset resends
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Validation functions
  const validateEmail = (val: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val);
  const validatePassword = (val: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val);

  // Switch views cleanly with log support
  const switchForm = (type: AuthFormType) => {
    logger.info(`Switching view state to: ${type.toUpperCase()}`, 'AuthPanel');
    setFormType(type);
    setEmail('');
    setUsername('');
    setPassword('');
  };

  // 1. LOGIN SCRIPT
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    const uName = username.trim();
    const pass = password;

    if (!mail || !uName || !pass) {
      showToast('Lütfen tüm alanları doldurun.', 'warning');
      return;
    }
    if (!validateEmail(mail)) {
      showToast('Geçerli bir e-posta giriniz.', 'warning');
      return;
    }

    setIsLoading(true);
    logger.info(`Attempting verification login for: ${mail}`, 'AuthPanel');

    try {
      const userRef = doc(db, 'users', mail);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const docData = docSnap.data();
        const hashedInput = await hashPassword(pass);
        const correctHashed = docData.password;

        // Legacy plaintext matching vs modern cryptographic hashes
        const isMatch = (hashedInput === correctHashed || pass === correctHashed);

        if (docData.username === uName && isMatch) {
          // If the profile used plain passwords before, securely migrate it online!
          if (pass === correctHashed) {
            await updateDoc(userRef, { password: hashedInput });
            logger.success(`Plain password representation for user ${mail} upgraded to SHA-256`, 'Security');
          }

          logger.success(`Successfully authenticated: ${mail}`, 'AuthPanel');
          showToast('Giriş Başarılı!', 'success');
          onAuthSuccess(mail, uName);
        } else {
          logger.warn(`Failed credentials attempt for: ${mail}`, 'AuthPanel');
          showToast('Hatalı kullanıcı adı veya şifre.', 'error');
        }
      } else {
        logger.warn(`Non-existent user lookup attempt: ${mail}`, 'AuthPanel');
        showToast('Bu e-posta sisteme kayıtlı değil.', 'error');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${mail}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. SIGNUP SCRIPT
  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    const uName = username.trim();
    const pass = password;

    if (!mail || !uName || !pass) {
      showToast('Tüm alanları doldurmalısınız.', 'warning');
      return;
    }
    if (!validateEmail(mail)) {
      showToast('Geçersiz e-posta formatı.', 'warning');
      return;
    }
    if (!validatePassword(pass)) {
      showToast('Şifreniz en az 8 karakter, 1 rakam, 1 büyük ve 1 küçük harf içermelidir.', 'warning');
      return;
    }

    setIsLoading(true);
    logger.info(`Starting signup check for user: ${mail} (${uName})`, 'AuthPanel');

    try {
      const userRef = doc(db, 'users', mail);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        logger.warn(`User creation rejected: Email already registered: ${mail}`, 'AuthPanel');
        showToast('Bu e-posta zaten kullanımda.', 'error');
      } else {
        // Query if username is already taken in system
        const usersQueryRef = query(collection(db, 'users'), where('username', '==', uName));
        const userQuery = await getDocs(usersQueryRef);

        if (!userQuery.empty) {
          logger.warn(`User creation rejected: Username already exists: ${uName}`, 'AuthPanel');
          showToast('Kullanıcı adı başkası tarafından alınmış.', 'warning');
        } else {
          const securePassword = await hashPassword(pass);
          await setDoc(userRef, { username: uName, password: securePassword });
          
          logger.success(`Account successfully created: ${mail}`, 'AuthPanel');
          showToast('Kayıt başarılı! Yönlendiriliyorsunuz...', 'success');
          onAuthSuccess(mail, uName);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${mail}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. SEND RESET LINK
  const handleSendResetLink = async (isResend = false) => {
    const mail = email.trim();
    if (!validateEmail(mail)) {
      showToast('Lütfen geçerli bir e-posta girin.', 'warning');
      return;
    }

    setIsLoading(true);
    logger.info(`Triggering password reset flow for: ${mail}`, 'AuthPanel');

    try {
      const userRef = doc(db, 'users', mail);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await updateDoc(userRef, { resetToken: token });

        const resetUrl = `${window.location.origin}${window.location.pathname}?token=${token}&email=${encodeURIComponent(mail)}`;
        const localTimeStr = new Date().toLocaleString('tr-TR');

        const success = await sendResetEmail({
          name: docSnap.data().username || 'Kullanıcı',
          user_email: mail,
          reset_link: resetUrl,
          time: localTimeStr,
        });

        if (success) {
          showToast(isResend ? 'Yeni bağlantı gönderildi.' : 'Sıfırlama bağlantısı e-postanıza gönderildi.', 'success');
          setResendCooldown(60); // 1-minute cooldown
          setFormType('forgot');
        } else {
          showToast('Mail servisi yanıt vermiyor. Lütfen tekrar deneyin.', 'error');
        }
      } else {
        logger.warn(`Password reset requested on unlisted registry: ${mail}`, 'AuthPanel');
        showToast('Sistemde böyle bir kullanıcı bulunamadı.', 'error');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${mail}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. VERIFY RESET TOKEN
  const verifyResetToken = async (emailParam: string, token: string) => {
    setIsLoading(true);
    logger.info(`Validating reset token parameters for user: ${emailParam}`, 'AuthPanel');

    try {
      const userRef = doc(db, 'users', emailParam);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists() && docSnap.data().resetToken === token) {
        setValidatedResetEmail(emailParam);
        setFormType('reset');
        logger.success(`Valid token confirmed. Prepared password override state for: ${emailParam}`, 'AuthPanel');
      } else {
        logger.warn(`Illegal or stale reset token attempt detected for: ${emailParam}`, 'AuthPanel');
        showToast('Bağlantı geçersiz veya süresi dolmuş.', 'error');
        setFormType('login');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${emailParam}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. SAVE NEW PASSWORD
  const handleSaveNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    const pass = password;

    if (!validatePassword(pass)) {
      showToast('Şifreniz güvenlik standartlarına uymuyor.', 'warning');
      return;
    }

    setIsLoading(true);
    logger.info(`Applying new password for verified account: ${validatedResetEmail}`, 'AuthPanel');

    try {
      const userRef = doc(db, 'users', validatedResetEmail);
      const securePassword = await hashPassword(pass);
      
      await updateDoc(userRef, {
        password: securePassword,
        resetToken: deleteField(),
      });

      logger.success(`Password override completed successfully for: ${validatedResetEmail}`, 'AuthPanel');
      showToast('Şifreniz güncellendi! Giriş yapabilirsiniz.', 'success');
      
      // Clear address bar parameters cleanly
      window.history.pushState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        switchForm('login');
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${validatedResetEmail}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-height-screen p-4">
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden relative backdrop-blur-md">
        
        {/* Visual design element */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-800" />

        <div className="p-8 md:p-10">
          <AnimatePresence mode="wait">
            {formType === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">Giriş Yap</h2>
                  <p className="text-sm text-slate-400 mt-1.5">Yönetim paneline erişmek için giriş yapın.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">E-posta Adresi</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ornek@sirket.com"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Kullanıcı Adı</label>
                    <div className="relative">
                      <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Kullanıcı adınız"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Şifre</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => switchForm('forgot')}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors pointer-events-auto cursor-pointer"
                    >
                      Şifremi Unuttum?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-505 text-slate-100 font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                  >
                    <span>Giriş Yap</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="text-center mt-6 text-sm text-slate-400">
                  Hesabınız yok mu?{' '}
                  <button
                    onClick={() => switchForm('signup')}
                    className="font-bold text-emerald-400 hover:underline cursor-pointer"
                  >
                    Hemen Kaydolun
                  </button>
                </div>
              </motion.div>
            )}

            {formType === 'signup' && (
              <motion.div
                key="signup"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">Hesap Oluştur</h2>
                  <p className="text-sm text-slate-400 mt-1.5">Sisteme dahil olmak için yeni kayıt oluşturun.</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">E-posta Adresi</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ornek@sirket.com"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Kullanıcı Adı</label>
                    <div className="relative">
                      <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Kullanıcı adınız"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Şifre Oluşturun</label>
                    <div className="relative">
                      <Key className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex gap-2.5 items-start">
                      <Info className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                        Min. 8 karakter, 1 en az büyük harf, 1 en az küçük harf ve 1 en az rakam olmalıdır.
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-505 text-slate-100 font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                  >
                    <span>Kaydol</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="text-center mt-6 text-sm text-slate-400">
                  Zaten hesabınız var mı?{' '}
                  <button
                    onClick={() => switchForm('login')}
                    className="font-bold text-emerald-400 hover:underline cursor-pointer"
                  >
                    Giriş Yapın
                  </button>
                </div>
              </motion.div>
            )}

            {formType === 'forgot' && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">Şifre Sıfırlama</h2>
                  <p className="text-sm text-slate-400 mt-1.5">Kayıtlı e-posta adresinize sıfırlama linki göndereceğiz.</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">E-posta Adresi</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ornek@sirket.com"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                  </div>

                  {resendCooldown === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleSendResetLink(false)}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-505 text-slate-100 font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-75"
                    >
                      <span>Sıfırlama Linki Gönder</span>
                      <Send className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="text-center space-y-3">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex gap-2.5 items-center justify-center text-emerald-450 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Bağlantı başarıyla iletildi.</span>
                      </div>
                      <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                        E-posta ulaşmadı mı? <br />
                        <button
                          onClick={() => handleSendResetLink(true)}
                          className="text-emerald-400 hover:underline font-bold mt-1 cursor-pointer"
                        >
                          Yeniden Gönder ({resendCooldown}s)
                        </button>
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => switchForm('login')}
                    className="w-full flex items-center justify-center gap-2 mt-4 text-xs font-extrabold text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Giriş Ekranına Dön</span>
                  </button>
                </div>
              </motion.div>
            )}

            {formType === 'reset' && (
              <motion.div
                key="reset"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">Yeni Şifre Belirle</h2>
                  <p className="text-sm text-slate-400 mt-1.5" id="resetSubtitle">
                    {validatedResetEmail ? `${validatedResetEmail} için yeni şifrenizi belirleyin.` : 'Lütfen hesabınız için yeni şifre girin.'}
                  </p>
                </div>

                <form onSubmit={handleSaveNewPassword} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Yeni Şifre</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Yeni şifreniz"
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800/80 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm font-medium text-slate-100 placeholder-slate-600"
                      />
                    </div>
                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex gap-2.5 items-start">
                      <Info className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                        En az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam.
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !validatedResetEmail}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-505 text-slate-100 font-bold py-3.5 px-4 rounded-xl shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed text-sm"
                  >
                    <span>Şifremi Kaydet</span>
                    <Check className="w-4 h-4" />
                  </button>

                  <div className="text-center mt-4">
                    <a
                      href="?"
                      className="text-xs font-extrabold text-slate-500 hover:text-slate-350 hover:underline"
                    >
                      İptal ve Ana Ekrana Dön
                    </a>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
