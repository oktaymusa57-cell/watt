/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Device, DeviceStatus } from '../types';
import { 
  Play, 
  Square, 
  AlertTriangle, 
  Plug, 
  Cpu, 
  CheckCircle, 
  MoreVertical, 
  Zap, 
  Hourglass,
  Loader2
} from 'lucide-react';
import { logger } from '../lib/logger';

interface DeviceCardProps {
  key?: string;
  device: Device;
  onOpenDetails: (id: string) => void;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onToggleEmergency: (id: string, isChecked: boolean) => Promise<void>;
  onUnplug: (id: string) => Promise<void>;
  onPlugin: (id: string) => Promise<void>;
}

export default function DeviceCard({
  device,
  onOpenDetails,
  onStart,
  onStop,
  onToggleEmergency,
  onUnplug,
  onPlugin
}: DeviceCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { id, status, kwh, emergency, plugged, type = 'AC' } = device;
  const lowercaseStatus = (status || 'Off').toLowerCase();

  const isOff = lowercaseStatus === 'off';
  const isEmg = emergency === true;
  const isPreparing = lowercaseStatus === 'preparing';
  const isAvailable = lowercaseStatus === 'available';
  const isCharging = lowercaseStatus === 'charging';
  const isPlugged = plugged !== false;

  // Base State of Charge (SoC) plus progressive charging increment based on active kWh consumption
  const baseSoc = 15 + (parseInt(id.slice(-4), 16) || 0) % 56;
  const mockSoc = Math.min(100, Math.floor(baseSoc + (kwh * 1.6) % (101 - baseSoc)));

  // Dynamic status-badge class assignment
  let badgeClass = 'text-slate-500 border-slate-800 bg-slate-950/80';
  let badgeIcon = <Square className="w-3.5 h-3.5 shrink-0" />;
  let badgeText = 'OFF';
  let cardClass = 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-900/85';

  if (lowercaseStatus === 'available') {
    badgeClass = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 duration-200';
    badgeIcon = <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />;
    badgeText = 'AVAILABLE';
    cardClass = 'bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-950 border-emerald-500/30 text-slate-100 hover:border-emerald-500/80 hover:shadow-[0_10px_30px_-5px_rgba(16,185,129,0.2)]';
  } else if (lowercaseStatus === 'preparing') {
    badgeClass = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    badgeIcon = <Hourglass className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />;
    badgeText = 'PREPARING';
    cardClass = 'bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-950 border-amber-500/30 text-slate-100 hover:border-amber-500/85 hover:shadow-[0_10px_30px_-5px_rgba(245,158,11,0.2)]';
  } else if (lowercaseStatus === 'charging') {
    badgeClass = 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    badgeIcon = <Zap className="w-3.5 h-3.5 shrink-0 text-blue-400 animate-bounce" />;
    badgeText = 'CHARGING';
    cardClass = 'bg-gradient-to-br from-blue-950/20 via-slate-900 to-slate-950 border-blue-500/30 text-slate-100 hover:border-blue-500/85 hover:shadow-[0_10px_30px_-5px_rgba(59,130,246,0.2)]';
  } else if (lowercaseStatus === 'emergency stop' || isEmg) {
    badgeClass = 'text-rose-400 border-rose-500/20 bg-rose-500/5 animate-pulse';
    badgeIcon = <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />;
    badgeText = 'FAULTED';
    cardClass = 'bg-gradient-to-br from-rose-950/20 via-slate-900 to-slate-950 border-rose-500/30 text-slate-100 hover:border-rose-500/85 hover:shadow-[0_10px_30px_-5px_rgba(239,68,68,0.2)]';
  }

  const runAction = async (actionName: string, callFn: () => Promise<void>) => {
    setActionLoading(actionName);
    logger.info(`Action triggered: [${actionName}] on device [${id}]`, 'DeviceCardAction');
    try {
      await callFn();
    } catch (err) {
      logger.error(`Failed executing card action [${actionName}]`, 'DeviceCardAction', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div 
      onClick={() => onOpenDetails(id)}
      className={`device-card rounded-2xl p-5 border cursor-pointer select-none relative overflow-hidden transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between min-h-[290px] ${cardClass}`}
    >
      {/* Glow highlight decorative accent */}
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header section (Icon, Title & Consumption) */}
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="flex gap-3 items-center">
          <div className="w-10 h-10 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-slate-200">{id.substring(0, 16)}...</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{type} CHARGER</span>
          </div>
        </div>

        <div className="text-right">
          <span className="block font-mono text-lg font-bold text-slate-100">{Number(kwh || 0).toFixed(2)}</span>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">kWh</span>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails(id);
          }}
          className="text-slate-500 hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Live Badge Wrapper */}
      <div className="mt-4 mb-5">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wider select-none ${badgeClass}`}>
          {badgeIcon}
          <span>{badgeText}</span>
        </span>
      </div>

      {/* Visual State Representation area */}
      <div className="flex-1 flex flex-col justify-center min-h-[60px] pb-4">
        {isCharging ? (
          type === 'DC' ? (
            <div className="w-full">
              <div className="flex justify-between items-end mb-1.5 px-0.5">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">SoC oranı</span>
                <span className="text-xs font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">{mockSoc}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850/80">
                <div className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)] transition-all duration-500" style={{ width: `${mockSoc}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 font-bold text-xs py-3 px-4 rounded-xl border border-emerald-500/20">
              <Zap className="w-4 h-4 text-emerald-400 fill-emerald-500/20 animate-pulse" />
              <span>Şarj Oluyor...</span>
            </div>
          )
        ) : isPreparing ? (
          <div className="flex items-center justify-center gap-2 bg-amber-500/10 text-amber-400 font-bold text-[11px] py-2.5 px-3.5 rounded-xl border border-amber-500/15">
            <Hourglass className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
            <span>Bağlantı Bekleniyor...</span>
          </div>
        ) : null}
      </div>

      {/* Card Action Buttons bottom segment */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="flex gap-2 border-t border-slate-800/80 pt-4"
      >
        {isOff ? (
          <button
            onClick={() => runAction('START', () => onStart(id))}
            disabled={isEmg || actionLoading !== null}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-950/60 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white hover:border-emerald-500 text-emerald-400 font-bold text-xs py-2 px-3 rounded-xl transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {actionLoading === 'START' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>START</span>
          </button>
        ) : (
          <button
            onClick={() => runAction('STOP', () => onStop(id))}
            disabled={isEmg || actionLoading !== null}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-950/60 border border-rose-500/30 hover:bg-rose-600 hover:text-white hover:border-rose-500 text-rose-400 font-bold text-xs py-2 px-3 rounded-xl transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {actionLoading === 'STOP' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5 fill-current" />
            )}
            <span>STOP</span>
          </button>
        )}

        {/* Plug checker control toggle */}
        <button
          onClick={() => runAction(isPlugged ? 'UNPLUG' : 'PLUGIN', isPlugged ? () => onUnplug(id) : () => onPlugin(id))}
          disabled={isOff || isEmg || isCharging || actionLoading !== null}
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-950/60 border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {actionLoading === 'UNPLUG' || actionLoading === 'PLUGIN' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <Plug className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="text-[10px] tracking-wide uppercase font-semibold">{isPlugged ? 'UNPLUG' : 'PLUG IN'}</span>
        </button>

        {/* Quick Emergency stop toggle button */}
        <button
          onClick={() => runAction('EMG_TOGGLE', () => onToggleEmergency(id, !isEmg))}
          className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95
            ${isEmg 
              ? 'bg-rose-600 text-slate-100 border-rose-600 shadow-md shadow-rose-950/40 animate-pulse' 
              : 'bg-slate-950/60 border-slate-800 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500'
            }
          `}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
}
