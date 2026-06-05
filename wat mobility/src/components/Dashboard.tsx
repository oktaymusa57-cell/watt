/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { Device, DeviceStatus, UserSession, OperationType } from '../types';
import { useToast } from './Toast';
import { logger } from '../lib/logger';
import DeviceCard from './DeviceCard';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Power, 
  Clock, 
  User, 
  Sparkles, 
  Activity, 
  Play, 
  Square,
  Plug,
  RefreshCw,
  LogOut,
  CheckCircle,
  Loader2,
  Lock,
  Layers,
  Thermometer,
  Gauge,
  Cpu,
  Zap,
  MoreVertical,
  X,
  AlertTriangle
} from 'lucide-react';

interface DashboardProps {
  session: UserSession;
  onLogout: () => void;
}

const ITEMS_PER_PAGE = 10;

// Centralized hardcoded physical hardware station list from core configuration
const DEVICE_IDS = [
  "XYM221003D1W1C2413A001A0", "XYM221003D1W1C2413A002A0", "XYM221003D1W1C2413A003A0",
  "XYM221003D1W1C2413A004A0", "XYM221003D1W1C2413A005A0", "XYM221003D1W1C2413A006A0",
  "XYM221003D1W1C2413A007A0", "XYM221003D1W1C2413A008A0", "XYM221003D1W1C2413A009A0",
  "XYM221003D1W1C2413A010A0", "XYM221003D1W1C2413A011A0", "XYM221003D1W1C2413A012A0",
  "XYM221003D1W1C2413A013A0", "XYM221003D1W1C2413A014A0", "XYM221003D1W1C2413A015A0",
  "XYM221003D1W1C2413A016A0", "XYM221003D1W1C2413A017A0", "XYM221003D1W1C2413A018A0",
  "XYM221003D1W1C2413A019A0", "XYM221003D1W1C2413A020A0", "XYM221003D1W1C2413A021A0",
  "XYM221003D1W1C2413A022A0", "XYM221003D1W1C2413A023A0", "XYM221003D1W1C2413A024A0",
  "XYM221003D1W1C2413A025A0", "XYM221003D1W1C2413A026A0", "XYM221003D1W1C2413A027A0",
  "XYM221003D1W1C2413A028A0", "XYM221003D1W1C2413A029A0", "XYM221003D1W1C2413A030A0"
];

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [liveTime, setLiveTime] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [activePanelDeviceId, setActivePanelDeviceId] = useState<string | null>(null);

  // Real-time dynamic fluctuations simulation tick and accumulations
  const [tick, setTick] = useState(0);
  const [sessionSimulations, setSessionSimulations] = useState<Record<string, { kwhAdded: number; socAdded: number }>>({});

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1500); // Trigger a client-side update with minor random fluctuations every 1.5 seconds
    return () => clearInterval(timer);
  }, []);

  // Update dynamic simulated kWh consumption and SoC increments
  useEffect(() => {
    setSessionSimulations((prev) => {
      const next = { ...prev };
      let changed = false;

      devices.forEach((d) => {
        const lowercaseStatus = (d.status || 'Off').toLowerCase();
        if (lowercaseStatus === 'charging' || lowercaseStatus === 'preparing' || lowercaseStatus === 'available') {
          const currentSim = next[d.id] || { kwhAdded: 0, socAdded: 0 };
          let kwhIncrease = 0.0001; // default standby AC/DC consumption
          let socIncrease = 0;

          if (lowercaseStatus === 'charging') {
            kwhIncrease = d.type === 'DC' ? 0.0048 : 0.0009; // charging speed simulation (DC faster)
            socIncrease = d.type === 'DC' ? 0.12 : 0;
          } else if (lowercaseStatus === 'preparing') {
            kwhIncrease = d.type === 'DC' ? 0.0007 : 0.0002;
          }

          next[d.id] = {
            kwhAdded: currentSim.kwhAdded + kwhIncrease,
            socAdded: currentSim.socAdded + socIncrease,
          };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [tick, devices]);

  // Keep devices in a ref to bypass React closures during background timers
  const devicesRef = useRef<Device[]>([]);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Store transition handles for individual active timers safely
  const flowTimersRef = useRef<Record<string, number>>({});

  // 1. Live status clock updates
  useEffect(() => {
    const updateTime = () => {
      setLiveTime(new Date().toLocaleTimeString('tr-TR'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Automated clean-up of transition timers on unmount
  useEffect(() => {
    return () => {
      Object.values(flowTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId as any);
      });
    };
  }, []);

  const clearFlowTimer = (id: string) => {
    if (flowTimersRef.current[id]) {
      window.clearTimeout(flowTimersRef.current[id] as any);
      delete flowTimersRef.current[id];
    }
  };

  // Triggers automated 5-second transitional loop (Preparing -> Available)
  const startTransitionFlowTimer = (id: string) => {
    clearFlowTimer(id);

    logger.info(`Starting 5-second automatic transitional loop from [Preparing] to [Available] for ${id}`, 'DeviceFlow');

    const timerId = window.setTimeout(async () => {
      const currentDevices = [...devicesRef.current];
      const found = currentDevices.find((d) => d.id === id);

      if (found && !found.emergency && found.status === 'Preparing') {
        logger.info(`5s timer complete. Upgrading status of ${id} to 'Available'`, 'DeviceFlow');
        await updateDeviceInFirestore(id, { 
          status: 'Available'
        });
      }
    }, 5000);

    flowTimersRef.current[id] = timerId;
  };

  // Triggers automated 5-second transitional loop (Available + Plugged -> Charging)
  const startChargingFlowTimer = (id: string) => {
    clearFlowTimer(id);

    logger.info(`Starting 5-second automatic transitional loop from [Available] to [Charging] for ${id}`, 'DeviceFlow');

    const timerId = window.setTimeout(async () => {
      const currentDevices = [...devicesRef.current];
      const found = currentDevices.find((d) => d.id === id);

      if (found && !found.emergency && found.status === 'Available' && found.plugged !== false) {
        logger.info(`5s timer complete. Upgrading status of ${id} to 'Charging'`, 'DeviceFlow');
        await updateDeviceInFirestore(id, { 
          status: 'Charging'
        });
      }
    }, 5000);

    flowTimersRef.current[id] = timerId;
  };

  // Automated state-machine transitions triggers
  useEffect(() => {
    if (isInitializing) return;

    devices.forEach((d) => {
      const lowercaseStatus = (d.status || 'Off').toLowerCase();
      
      // Auto-transition Preparing -> Available after 5s
      if (lowercaseStatus === 'preparing' && !flowTimersRef.current[d.id]) {
        startTransitionFlowTimer(d.id);
      }

      // Auto-transition Available -> Charging after 5s if plugged
      if (lowercaseStatus === 'available' && d.plugged !== false && !flowTimersRef.current[d.id]) {
        startChargingFlowTimer(d.id);
      }
    });
  }, [devices, isInitializing]);

  // 3. Real-time Firestore synchronization feed and automatic registry setup
  useEffect(() => {
    logger.info('Opening real-time database listener channels...', 'DatabaseSync');
    
    const colRef = collection(db, 'devices');
    const unsubscribe = onSnapshot(colRef, 
      async (snapshot) => {
        const fetchedList: Device[] = [];
        snapshot.forEach((docSnap) => {
          fetchedList.push(docSnap.data() as Device);
        });

        const existingIds = fetchedList.map((d) => d.id);
        const missingIds = DEVICE_IDS.filter((id) => !existingIds.includes(id));

        if (missingIds.length > 0) {
          logger.info(`Initializing ${missingIds.length} missing hardware stations in database...`, 'DatabaseSync');
          try {
            const batch = writeBatch(db);
            missingIds.forEach((id, index) => {
              const docRef = doc(db, 'devices', id);
              batch.set(docRef, {
                id,
                status: 'Off',
                kwh: 0,
                emergency: false,
                plugged: true,
                type: index % 2 === 0 ? 'DC' : 'AC',
                lastBoot: new Date(Date.now() - Math.random() * 500000000).toISOString(),
                lastHeartbeat: new Date(Date.now() - Math.random() * 500000).toISOString()
              }, { merge: true });
            });
            await batch.commit();
            logger.success('Missing station batch enrollment complete.', 'DatabaseSync');
          } catch (err) {
            logger.error('Missing batch enrollment failed', 'DatabaseSync', err);
          }
        }

        const orderedDevices = DEVICE_IDS.map((id, index) => {
          const matched = fetchedList.find((x) => x.id === id);
          return matched || {
            id,
            status: 'Off' as DeviceStatus,
            kwh: 0,
            emergency: false,
            plugged: true,
            type: index % 2 === 0 ? 'DC' : 'AC',
            lastBoot: new Date(Date.now() - (index + 2) * 24 * 3600 * 1000).toISOString(),
            lastHeartbeat: new Date(Date.now() - (index + 1) * 60 * 1000).toISOString()
          };
        });

        setDevices(orderedDevices);
        setIsInitializing(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'devices');
      }
    );

    return () => {
      logger.info('Closing database listeners...', 'DatabaseSync');
      unsubscribe();
    };
  }, []);

  // Updates single document on firestore
  const updateDeviceInFirestore = async (id: string, fields: Partial<Device>) => {
    try {
      const docRef = doc(db, 'devices', id);
      await setDoc(docRef, { 
        ...fields, 
        id, 
        lastHeartbeat: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `devices/${id}`);
    }
  };

  // State counts and energy aggregations
  const counts = useMemo(() => {
    const computedDevices = devices.map((d) => {
      const sim = sessionSimulations[d.id] || { kwhAdded: 0, socAdded: 0 };
      return {
        ...d,
        kwh: (d.kwh || 0) + sim.kwhAdded,
      };
    });

    return {
      preparing: computedDevices.filter((d) => d.status === 'Preparing').length,
      available: computedDevices.filter((d) => d.status === 'Available').length,
      charging: computedDevices.filter((d) => d.status === 'Charging').length,
      emergencyStatus: computedDevices.filter((d) => d.emergency).length,
      off: computedDevices.filter((d) => d.status === 'Off').length,
      totalEnergy: computedDevices.reduce((sum, d) => sum + (d.kwh || 0), 0)
    };
  }, [devices, sessionSimulations]);

  // Page index limits
  const visibleDevices = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return devices.slice(start, start + ITEMS_PER_PAGE);
  }, [devices, currentPage]);

  const totalPages = Math.ceil(devices.length / ITEMS_PER_PAGE);

  // Dynamic plug checker controls
  const pagePlugControls = useMemo(() => {
    const isAllOff = visibleDevices.every((d) => (d.status || '').toLowerCase() === 'off');
    
    let pluggedCount = 0;
    let unpluggedCount = 0;

    visibleDevices.forEach((d) => {
      const st = (d.status || '').toLowerCase();
      if (st !== 'off' && !d.emergency) {
        d.plugged ? pluggedCount++ : unpluggedCount++;
      }
    });

    const isPlugMode = unpluggedCount > pluggedCount;

    return {
      disabled: isAllOff,
      mode: isPlugMode ? 'plugin' : 'unplug' as 'plugin' | 'unplug',
      label: isPlugMode ? 'Sayfayı Tak (Plug in)' : 'Sayfayı Çıkar (Unplug)',
    };
  }, [visibleDevices]);

  // --- CONTROLLER HANDLERS (As in provided HTML file actions) ---

  const handleStart = async (id: string) => {
    clearFlowTimer(id);
    await updateDeviceInFirestore(id, { 
      status: 'Preparing', 
      emergency: false, 
      plugged: true 
    });
    startTransitionFlowTimer(id);
  };

  const handleStop = async (id: string) => {
    clearFlowTimer(id);
    await updateDeviceInFirestore(id, { 
      status: 'Off', 
      emergency: false, 
      plugged: true 
    });
  };

  const handleToggleEmergency = async (id: string, isChecked: boolean) => {
    clearFlowTimer(id);
    if (isChecked) {
      await updateDeviceInFirestore(id, { 
        emergency: true, 
        status: 'Emergency Stop' 
      });
    } else {
      await updateDeviceInFirestore(id, { 
        emergency: false, 
        status: 'Off', 
        kwh: 0 
      });
    }
  };

  const handleTogglePlug = async (id: string, shouldPlug: boolean) => {
    clearFlowTimer(id);
    await updateDeviceInFirestore(id, { 
      plugged: shouldPlug, 
      status: shouldPlug ? 'Available' : 'Preparing' 
    });
  };

  const handlePlugin = async (id: string) => {
    await handleTogglePlug(id, true);
  };

  const handleUnplug = async (id: string) => {
    await handleTogglePlug(id, false);
  };

  // Local Page triggers
  const executePageControl = async (type: 'START' | 'STOP') => {
    logger.info(`Running Sayfayı ${type === 'START' ? 'Başlat' : 'Durdur'} for page ${currentPage}`, 'Dashboard');
    try {
      const pageList = [...visibleDevices];
      for (const d of pageList) {
        const s = (d.status || '').toLowerCase();
        if (type === 'START' && s === 'off') {
          await handleStart(d.id);
        }
        if (type === 'STOP' && !d.emergency && s !== 'off') {
          await handleStop(d.id);
        }
      }
      showToast(`Sayfa ${type === 'START' ? 'hazırlık moduna alındı' : 'durduruldu'}.`, 'info');
    } catch (err) {
      logger.error('Failed executing local page wide controls', 'Dashboard', err);
    }
  };

  // Global triggers for entire hardware station network
  const executeGlobalControl = async (type: 'START' | 'STOP') => {
    logger.info(`Running Global ${type === 'START' ? 'Başlat' : 'Durdur'} trigger`, 'Dashboard');
    try {
      const batchList = [...devices];
      for (const d of batchList) {
        const s = (d.status || '').toLowerCase();
        if (type === 'START' && s === 'off') {
          await handleStart(d.id);
        }
        if (type === 'STOP' && !d.emergency && s !== 'off') {
          await handleStop(d.id);
        }
      }
      showToast(`Tüm cihazlar ${type === 'START' ? 'hazırlık moduna alındı' : 'durduruldu'}!`, 'info');
    } catch (err) {
      logger.error('Failed executing global wide controls', 'Dashboard', err);
    }
  };

  const executePagePlugControl = async () => {
    const { mode } = pagePlugControls;
    logger.info(`Running local page plug controllers: Mode [${mode.toUpperCase()}]`, 'Dashboard');
    try {
      const pageList = [...visibleDevices];
      for (const d of pageList) {
        const s = (d.status || '').toLowerCase();
        if (!d.emergency && s !== 'off') {
          if (mode === 'unplug' && d.plugged !== false) {
            await handleUnplug(d.id);
          }
          if (mode === 'plugin' && s === 'preparing' && d.plugged === false) {
            await handlePlugin(d.id);
          }
        }
      }
      showToast(`Mevcut sayfa portları ${mode === 'plugin' ? 'aktif edildi' : 'sonlandırıldı'}.`, 'info');
    } catch (err) {
      logger.error('Failed executing page wide plug commands', 'Dashboard', err);
    }
  };

  // Helper calculation to fetch stable sensor data offset to prevent re-render flickering
  const getStableOffset = (idStr: string, limit: number) => {
    const val = parseInt(idStr.slice(-4), 16) || 0;
    return (val % (limit * 10)) / 10;
  };

  // Retrieve calculated details sensor model
  const activePanelDevice = useMemo(() => {
    if (!activePanelDeviceId) return null;
    const found = devices.find((d) => d.id === activePanelDeviceId) || null;
    if (!found) return null;
    const sim = sessionSimulations[found.id] || { kwhAdded: 0, socAdded: 0 };
    return {
      ...found,
      kwh: (found.kwh || 0) + sim.kwhAdded,
    };
  }, [devices, activePanelDeviceId, sessionSimulations]);

  // Sidebar dynamic calculation metrics with live realistic fluctuations
  const activeDeviceMetrics = useMemo(() => {
    if (!activePanelDevice) return null;
    const { id, status, type = 'AC' } = activePanelDevice;
    const st = (status || 'Off').toLowerCase();

    // Fluctuations using a deterministic-ish wave + tick factor + random noise
    const seed = parseInt(id.slice(-4), 16) || 1234;
    const wave1 = Math.sin((tick + seed) * 0.2);
    const wave2 = Math.cos((tick * 0.45) + seed);
    const noise = (wave1 * 0.6 + wave2 * 0.4); // ranges -1 to +1 roughly

    let baseVoltage = type === 'DC' ? 382.8 : 230.5;
    // Voltage fluctuates by +/- 2.5 Volts
    const voltFluctuation = baseVoltage > 0 && st !== 'off' && st !== 'emergency stop' ? (1.5 * noise) : 0;
    const finalVoltage = st === 'off' || st === 'emergency stop' ? 0 : baseVoltage + voltFluctuation;

    let baseCurrent = 0;
    if (st === 'charging') {
      baseCurrent = type === 'DC' ? 78.8 : 16.5;
    } else if (st === 'preparing') {
      baseCurrent = type === 'DC' ? 1.2 : 0.4;
    } else if (st === 'available') {
      baseCurrent = type === 'DC' ? 0.3 : 0.1;
    }
    // Current fluctuates by +/- 2% active power load factor
    const currFluctuation = baseCurrent > 0 ? (baseCurrent * 0.018 * noise) : 0;
    const finalCurrent = baseCurrent > 0 ? Math.max(0.1, baseCurrent + currFluctuation) : 0;

    let finalPower = 0;
    if (st === 'charging' || st === 'preparing') {
      if (type === 'DC') {
        finalPower = (finalVoltage * finalCurrent) / 1000;
      } else {
        finalPower = (finalVoltage * finalCurrent * 0.95) / 1000;
      }
    } else if (st === 'available') {
      finalPower = 0.05 + 0.01 * Math.abs(noise);
    }
    
    let baseTemp = 18;
    if (st === 'charging') {
      baseTemp = type === 'DC' ? 41 : 31;
    } else if (st === 'preparing') {
      baseTemp = 24;
    } else if (st === 'available') {
      baseTemp = 20;
    }
    const tempNoise = Math.sin(tick * 0.04 + seed) * 0.7 + (seed % 100) / 150;
    const finalTemp = st === 'off' || st === 'emergency stop' ? 18 + tempNoise * 0.5 : baseTemp + tempNoise * (st === 'charging' ? 2.2 : 1.1);

    return {
      voltage: finalVoltage.toFixed(1),
      current: finalCurrent.toFixed(1),
      activePower: finalPower.toFixed(2),
      temp: finalTemp.toFixed(1)
    };
  }, [activePanelDevice, tick]);

  return (
    <div className="min-h-screen bg-slate-950 pb-44 animate-in fade-in duration-300 text-slate-100">
      
      {/* 1. Dynamic navbar header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 border-b border-slate-800 shadow-lg backdrop-blur-md px-6 py-4.5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600 text-slate-100 p-2.5 rounded-xl shadow-md shadow-blue-500/10">
            <Power className="w-5 h-5 animate-pulse text-slate-100" />
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-100 tracking-tight block">Beko</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-0.5">
              WAT Mobility Smart Panel
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-slate-950 border border-slate-850 p-2 px-4.5 rounded-full flex items-center gap-4 text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="font-bold tracking-wider">{liveTime || '--:--:--'}</span>
            </div>
            <span className="text-slate-750 pointer-events-none select-none">|</span>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-blue-400 font-bold">{session.username}</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-4.5 py-2.5 border border-slate-800 bg-slate-900 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 rounded-xl font-bold text-xs tracking-wide text-slate-300 transition-all cursor-pointer box-border"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </header>

      {/* 2. Primary layout board content container */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* Real-time status cards row */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-md flex items-center gap-4 backdrop-blur-sm">
            <div className="bg-blue-500/10 text-blue-450 p-3 rounded-xl border border-blue-500/10 shrink-0">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Toplam Cihaz</span>
              <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">{devices.length}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-md flex items-center gap-4 backdrop-blur-sm">
            <div className="bg-emerald-500/10 text-emerald-450 p-3 rounded-xl border border-emerald-500/10 shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Kullanıma Hazır</span>
              <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">{counts.available}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-md flex items-center gap-4 backdrop-blur-sm">
            <div className="bg-amber-500/10 text-amber-450 p-3 rounded-xl border border-amber-500/10 shrink-0 animate-pulse">
              <RefreshCw className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Şarja Hazırlanan</span>
              <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">{counts.preparing}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-md flex items-center gap-4 backdrop-blur-sm">
            <div className="bg-blue-500/10 text-blue-450 p-3 rounded-xl border border-blue-500/10 shrink-0">
              <Zap className="w-5 h-5 text-blue-450" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Toplam Güç tüketimi</span>
              <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">
                {counts.totalEnergy.toFixed(1)} kW
              </span>
            </div>
          </div>
        </section>

        {/* Global Controls Row */}
        <section className="bg-slate-950 text-slate-100 rounded-3xl p-6 shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col md:flex-row gap-5 justify-between items-center bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950">
          <div className="absolute top-0 right-0 w-85 h-85 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-1 z-10 text-center md:text-left">
            <div className="flex gap-2 items-center justify-center md:justify-start">
              <Sparkles className="w-4.5 h-4.5 text-blue-400 shrink-0" />
              <h2 className="text-xs font-extrabold tracking-wider text-blue-400 uppercase">
                İSTASYON KONTROL (Tüm Saha)
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-semibold max-w-lg">
              Saha üzerindeki tüm cihazların durumlarını ve port güç akışlarını tek tıklamayla toplu olarak yönetin.
            </p>
          </div>

          <div className="flex gap-3 z-10 flex-wrap justify-center shrink-0 w-full md:w-auto">
            <button
              onClick={() => executeGlobalControl('START')}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-slate-100 font-bold px-5 py-3 rounded-xl text-xs tracking-wide uppercase shadow-lg shadow-blue-500/10 cursor-pointer transition-all active:scale-95 duration-200"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>TÜMÜNÜ BAŞLAT</span>
            </button>

            <button
              onClick={() => executeGlobalControl('STOP')}
              className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-slate-100 font-bold px-5 py-3 rounded-xl text-xs tracking-wide uppercase shadow-lg shadow-rose-500/10 cursor-pointer transition-all active:scale-95 duration-200"
            >
              <Square className="w-4 h-4 fill-current shrink-0" />
              <span>TÜMÜNÜ DURDUR</span>
            </button>
          </div>
        </section>

        {/* Local Page Controls Row */}
        <section className="bg-slate-900/40 rounded-3xl p-6 border border-slate-800/80 shadow-md space-y-6 backdrop-blur-sm">
          <div className="border-b border-slate-800/80 pb-4">
            <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              SAYFA KONTROLLERİ (Page {currentPage})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => executePageControl('START')}
              className="flex items-center justify-center gap-2 px-5 py-4.5 rounded-xl text-sm font-bold tracking-wider uppercase transition-all bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white cursor-pointer hover:shadow-lg hover:shadow-emerald-500/15 max-h-[50px] leading-none"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>SAYFAYI BAŞLAT</span>
            </button>

            <button
              onClick={() => executePageControl('STOP')}
              className="flex items-center justify-center gap-2 px-5 py-4.5 rounded-xl text-sm font-bold tracking-wider uppercase transition-all bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white cursor-pointer hover:shadow-lg hover:shadow-rose-500/15 max-h-[50px] leading-none"
            >
              <Square className="w-4 h-4 fill-current shrink-0" />
              <span>SAYFAYI DURDUR</span>
            </button>

            <button
              onClick={executePagePlugControl}
              disabled={pagePlugControls.disabled}
              className={`
                flex items-center justify-center gap-2 px-5 py-4.5 rounded-xl text-sm font-bold tracking-wider uppercase transition-all border shrink-0 cursor-pointer max-h-[50px] leading-none col-span-1 sm:col-span-2 lg:col-span-1
                ${pagePlugControls.disabled
                  ? 'bg-slate-950 border-slate-850 text-slate-600 cursor-not-allowed opacity-50'
                  : pagePlugControls.mode === 'plugin'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450 hover:bg-emerald-600 hover:text-white'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-450 hover:bg-amber-600 hover:text-white'
                }
              `}
            >
              <Plug className="w-4 h-4 shrink-0" />
              <span>{pagePlugControls.label}</span>
            </button>
          </div>
        </section>

        {/* Dynamic Bento Cards Grid Container */}
        <section className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap select-none border-b border-slate-800/80 pb-3">
            <h3 className="font-extrabold text-slate-100 tracking-tight text-sm select-none">
              WAT İstasyonları İzleme Listesi ({currentPage}/{totalPages})
            </h3>
          </div>

          {isInitializing ? (
            <div className="flex flex-col gap-3 justify-center items-center py-24 bg-slate-900/20 rounded-3xl border border-slate-800">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-400 font-bold tracking-wide">Yükleniyor...</p>
            </div>
          ) : visibleDevices.length === 0 ? (
            <div className="p-16 border border-slate-800 rounded-3xl text-center bg-slate-900/10">
              <span className="text-slate-500 font-bold block text-sm">Hiçbir istasyon bulunamadı.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleDevices.map((device) => {
                const sim = sessionSimulations[device.id] || { kwhAdded: 0, socAdded: 0 };
                const simulatedDevice = {
                  ...device,
                  kwh: (device.kwh || 0) + sim.kwhAdded,
                };
                return (
                  <DeviceCard
                    key={device.id}
                    device={simulatedDevice}
                    onOpenDetails={(id) => setActivePanelDeviceId(id)}
                    onStart={handleStart}
                    onStop={handleStop}
                    onToggleEmergency={handleToggleEmergency}
                    onUnplug={handleUnplug}
                    onPlugin={handlePlugin}
                  />
                );
              })}
            </div>
          )}

          {/* Pagination Controllers block */}
          {!isInitializing && totalPages > 1 && (
            <div className="flex justify-center gap-1.5 flex-wrap pt-6">
              {Array.from({ length: totalPages }, (_, idx) => {
                const pageNo = idx + 1;
                return (
                  <button
                    key={pageNo}
                    onClick={() => setCurrentPage(pageNo)}
                    className={`
                      px-4 py-2 border rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm
                      ${currentPage === pageNo
                        ? 'bg-blue-600 text-slate-100 border-blue-600 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
                      }
                    `}
                  >
                    {pageNo}
                  </button>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* 3. Sliding Panel Details Right Drawer & Layer Panel Backing Overlay */}
      <AnimatePresence>
        {activePanelDeviceId && activePanelDevice && activeDeviceMetrics && (
          <>
            {/* Soft overlay wrapper backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePanelDeviceId(null)}
              className="fixed inset-0 bg-black z-40 backdrop-blur-[2px]"
            />

            {/* Sidebar Slide-over Panel Content */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 h-screen w-full sm:w-[450px] bg-slate-900 border-l border-slate-800 z-50 shadow-2xl flex flex-col justify-between"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <div className="flex gap-2 items-center">
                  <Cpu className="w-5 h-5 text-blue-500 animate-pulse" />
                  <span className="font-mono text-sm font-bold text-slate-100 tracking-wider">Cihaz ID detayları</span>
                </div>
                <button
                  onClick={() => setActivePanelDeviceId(null)}
                  className="bg-transparent border-0 text-slate-500 hover:text-rose-500 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Sidebar Body scrollable panel */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                
                {/* QR Section */}
                <div className="flex flex-col items-center justify-center bg-slate-950/50 border border-slate-800 rounded-2xl p-5 text-center">
                  <div className="p-1 bg-white rounded-lg inline-block mb-3">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(activePanelDevice.id)}`}
                      alt="Station QR Codes" 
                      className="w-28 h-28 aspect-square object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="font-mono text-xs text-slate-400 font-bold select-all tracking-wider break-all px-2">
                    {activePanelDevice.id}
                  </div>
                </div>

                {/* Status card block */}
                <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-5 space-y-3.5">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-850 pb-2">
                    DURUM VE BAĞLANTI (Status Details)
                  </h4>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Mevcut Statü</span>
                    <span className="font-bold underline text-slate-200 capitalize">
                      {activePanelDevice.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Cihaz Tipi</span>
                    <span className="font-mono font-bold text-blue-400">
                      {activePanelDevice.type || 'AC'} İstasyon
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Son BootNotification</span>
                    <span className="font-mono text-[11px] text-slate-350 font-medium">
                      {activePanelDevice.lastBoot ? new Date(activePanelDevice.lastBoot).toLocaleString('tr-TR') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Son Heartbeat feed</span>
                    <span className="font-mono text-[11px] text-slate-300 font-bold flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                      {activePanelDevice.lastHeartbeat ? new Date(activePanelDevice.lastHeartbeat).toLocaleString('tr-TR') : '-'}
                    </span>
                  </div>
                </div>

                {/* Meter readings values block */}
                <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-850 pb-2">
                    MeterValues (Anlık Sensör Ölçümleri)
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">kullanıcı Tüketim</span>
                      <strong className="text-lg font-black text-blue-400 font-mono tracking-tight">
                        {Number(activePanelDevice.kwh || 0).toFixed(2)} <span className="text-xs font-semibold">kWh</span>
                      </strong>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Menteşe Isısı</span>
                      <strong className="text-lg font-black text-blue-400 font-mono tracking-tight flex items-center justify-center gap-0.5">
                        <Thermometer className="w-4 h-4 text-rose-450 shrink-0" />
                        {activeDeviceMetrics.temp} <span className="text-xs font-semibold">°C</span>
                      </strong>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">voltaj Oranı</span>
                      <strong className="text-lg font-black text-blue-400 font-mono tracking-tight">
                        {activeDeviceMetrics.voltage} <span className="text-xs font-semibold">V</span>
                      </strong>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Amper Gücü</span>
                      <strong className="text-lg font-black text-blue-400 font-mono tracking-tight">
                        {activeDeviceMetrics.current} <span className="text-xs font-semibold">A</span>
                      </strong>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
                    <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">aktif şarj akış gücü</span>
                    <strong className="text-xl font-black text-blue-400 font-mono tracking-tight flex items-center justify-center gap-1">
                      <Gauge className="w-5 h-5 text-emerald-450 shrink-0" />
                      {activeDeviceMetrics.activePower} <span className="text-sm font-semibold">kW</span>
                    </strong>
                  </div>
                </div>

                {/* Sidebar manual action controllers */}
                <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-5 space-y-3.5">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Panel Güç Kontrolleri
                  </h4>

                  <div className="flex gap-2 w-full">
                    {(activePanelDevice.status || 'Off').toLowerCase() === 'off' ? (
                      <button
                        onClick={() => handleStart(activePanelDevice.id)}
                        disabled={activePanelDevice.emergency}
                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-slate-100 font-bold text-xs py-3 px-4 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span>Cihazı Başlat</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStop(activePanelDevice.id)}
                        disabled={activePanelDevice.emergency}
                        className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 text-slate-100 font-bold text-xs py-3 px-4 rounded-xl cursor-pointer disabled:opacity-40"
                      >
                        <Square className="w-4 h-4 fill-current shrink-0" />
                        <span>Cihazı Durdur</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleTogglePlug(activePanelDevice.id, !activePanelDevice.plugged)}
                      disabled={(activePanelDevice.status || '').toLowerCase() === 'off' || activePanelDevice.emergency || (activePanelDevice.status || '').toLowerCase() === 'charging'}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-100 text-xs py-3 px-4 rounded-xl cursor-pointer disabled:opacity-30"
                    >
                      <Plug className="w-4 h-4 shrink-0" />
                      <span className="font-semibold">{activePanelDevice.plugged ? 'Kabloyu Çıkar' : 'Kabloyu Tak'}</span>
                    </button>
                  </div>
                </div>

                {/* Emergency controls */}
                <div className="bg-rose-950/15 border border-rose-900/30 rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <div>
                      <span className="block text-xs font-bold text-rose-450 leading-none mb-1">Acil Durum Kesicisi (EMG)</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">Güç akışlarını anında keser</span>
                    </div>
                  </div>

                  {/* Toggle button element */}
                  <button
                    onClick={() => handleToggleEmergency(activePanelDevice.id, !activePanelDevice.emergency)}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer border transition-all active:scale-95 duration-200
                      ${activePanelDevice.emergency
                        ? 'bg-rose-600 text-slate-100 border-rose-600 shadow-md shadow-rose-950/50'
                        : 'bg-slate-950/50 border-slate-800 text-rose-400 hover:bg-rose-500/10'
                      }
                    `}
                  >
                    {activePanelDevice.emergency ? 'EMG ACTIVE' : 'EMG OFF'}
                  </button>
                </div>

              </div>

              {/* Sidebar bottom segment static profile */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-center text-[10px] text-slate-500 font-semibold tracking-wider uppercase select-none">
                Station Panel Detail Engine
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 4. Glass-morphic floating footer bar */}
      <footer className="fixed bottom-14 left-1/2 -translate-x-1/2 bg-slate-900/80 border border-slate-800/80 shadow-2xl backdrop-blur-md hover:bg-slate-900/95 transition-all text-slate-200 py-3.5 px-8 rounded-full z-30 flex items-center gap-8 text-xs font-semibold select-none shadow-black/80">
        <span className="flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          <span>Hazırlanıyor:</span>
          <b className="font-mono text-slate-200 bg-slate-950 px-2.5 py-1 rounded-md text-sm border border-slate-800/80">{counts.preparing}</b>
        </span>
        <span className="text-slate-800 select-none">|</span>
        <span className="flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Kullanıma Hazır:</span>
          <b className="font-mono text-slate-200 bg-slate-950 px-2.5 py-1 rounded-md text-sm border border-slate-800/80">{counts.available}</b>
        </span>
      </footer>

    </div>
  );
}
