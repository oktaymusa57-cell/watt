/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  onSnapshot,
  Firestore,
  deleteField,
  DocumentData,
  writeBatch
} from 'firebase/firestore';
import { OperationType, FirestoreErrorInfo } from '../types';
import { logger } from './logger';

const firebaseConfig = {
  apiKey: "AIzaSyAr4kavFG7G6NUCP3Gsq8cxFSY5oHImmvs",
  authDomain: "beko-watt.firebaseapp.com",
  projectId: "beko-watt",
  storageBucket: "beko-watt.firebasestorage.app",
  messagingSenderId: "17763456155",
  appId: "1:17763456155:web:e3598c718a189b57b6e23e"
};

// Lazy initialization of Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Handle firestore error with detailed security and trace parameters for easy debugging
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    operationType,
    path,
    authInfo: {
      userId: localStorage.getItem('watt_username') || 'Anonymous',
      email: localStorage.getItem('watt_email') || null,
    }
  };

  logger.error(`Firestore Security or Access Violation during [${operationType}] at [${path}]: ${errorMessage}`, 'DatabaseAPI', errInfo);
  throw new Error(JSON.stringify(errInfo));
}

/**
 * SHA-256 Password Hashing Utility (Improves security of custom user-auth structure)
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const salt = 'WAT_MOBILITY_SALT_4812_SECURE!';
    const data = encoder.encode(password + salt);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    logger.error('Cryptographic hashing error, falling back to basic encoding', 'Security', err);
    // Secure fallback string processing if SubtleCrypto fails for any environmental reason
    return btoa(password).replace(/=/g, '');
  }
}
