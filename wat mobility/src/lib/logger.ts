/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogEntry, LogType } from '../types';

type LogListener = (logs: LogEntry[]) => void;

class DebugLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 200;

  constructor() {
    this.info('System Logging initialized', 'LoggerCore');
  }

  private addLog(type: LogType, message: string, category = 'General', details?: any) {
    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(3, 9).toUpperCase();

    const entry: LogEntry = {
      id,
      timestamp,
      type,
      message: `[${category}] ${message}`,
      details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : undefined,
    };

    this.logs = [entry, ...this.logs].slice(0, this.maxLogs);
    
    // Output to developer console as well
    const consoleMsg = `%c[${type}] [${category}] ${message}`;
    let color = '#2563EB'; // info
    if (type === 'SUCCESS') color = '#059669';
    if (type === 'WARNING') color = '#D97706';
    if (type === 'ERROR') color = '#DC2626';

    console.log(consoleMsg, `color: ${color}; font-weight: bold;`, details || '');

    // Notify listeners
    this.listeners.forEach((listener) => listener([...this.logs]));
  }

  public info(message: string, category = 'General', details?: any) {
    this.addLog('INFO', message, category, details);
  }

  public success(message: string, category = 'General', details?: any) {
    this.addLog('SUCCESS', message, category, details);
  }

  public warn(message: string, category = 'General', details?: any) {
    this.addLog('WARNING', message, category, details);
  }

  public error(message: string, category = 'General', details?: any) {
    this.addLog('ERROR', message, category, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear() {
    this.logs = [];
    this.info('Logs cleared', 'LoggerCore');
    this.listeners.forEach((listener) => listener([]));
  }
}

export const logger = new DebugLogger();
export default logger;
