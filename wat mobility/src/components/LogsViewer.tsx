/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { Terminal, Trash2, Search, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { logger } from '../lib/logger';
import { LogEntry, LogType } from '../types';

export default function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<LogType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to logger feeds
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter = filter === 'ALL' || log.type === filter;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const handleCopy = (log: LogEntry) => {
    const text = `[${log.timestamp}] [${log.type}] ${log.message} ${log.details ? '\nDetails: ' + log.details : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800 shadow-2xl font-mono text-xs">
      {/* Logger Header controls */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 bg-zinc-900 cursor-pointer select-none hover:bg-zinc-850 transition-colors border-b border-zinc-800"
      >
        <div className="flex items-center gap-2 text-zinc-300">
          <Terminal className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-bold">WAT Mobility Debug Console</span>
          <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded text-[10px]">
            {logs.length} traces loaded
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="h-64 flex flex-col">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-zinc-900/50 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-zinc-500 mr-1">Filter:</span>
              {(['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`
                    px-2 py-1 rounded font-semibold tracking-wide cursor-pointer text-[10px]
                    ${filter === type 
                      ? 'bg-emerald-600 text-slate-100' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-750 hover:text-zinc-200'
                    }
                  `}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 grow max-w-md">
              <div className="relative w-full">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-zinc-500">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by keyword..."
                  className="w-full pl-8 pr-3 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <button
                onClick={() => logger.clear()}
                title="Clear logs"
                className="p-1.5 bg-zinc-850 hover:bg-red-950 hover:text-red-400 rounded transition-colors text-zinc-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Logs Output list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 text-zinc-300">
            {filteredLogs.length === 0 ? (
              <div className="text-zinc-600 text-center py-8">No matching log traces found.</div>
            ) : (
              filteredLogs.map((log) => {
                let badgeColor = 'text-blue-400 bg-blue-950/40 border-blue-900/50';
                if (log.type === 'SUCCESS') badgeColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50';
                if (log.type === 'WARNING') badgeColor = 'text-amber-400 bg-amber-950/40 border-amber-900/50';
                if (log.type === 'ERROR') badgeColor = 'text-rose-400 bg-rose-950/40 border-rose-900/50';

                return (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-2.5 p-1.5 hover:bg-zinc-900 rounded group border border-zinc-950 hover:border-zinc-850/80 transition-all text-[11px]"
                  >
                    <span className="text-zinc-500 select-none shrink-0 pt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${badgeColor}`}>
                      {log.type}
                    </span>
                    <span className="grow whitespace-pre-wrap select-all font-mono">
                      {log.message}
                      {log.details && (
                        <span className="block mt-1 text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-800/80 max-h-32 overflow-y-auto font-mono text-[10px] break-all">
                          {log.details}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleCopy(log)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 hover:text-zinc-100 rounded text-zinc-500 scale-90 transition-all cursor-pointer"
                      title="Copy log format"
                    >
                      {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
