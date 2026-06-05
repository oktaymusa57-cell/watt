/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DeviceStatus = 'Off' | 'Preparing' | 'Available' | 'Emergency Stop' | 'Charging';

export interface Device {
  id: string;
  status: DeviceStatus;
  kwh: number;
  emergency: boolean;
  plugged: boolean;
  type?: 'AC' | 'DC';
  lastBoot?: string;
  lastHeartbeat?: string;
  lastUpdate?: any;
}

export interface UserSession {
  email: string;
  username: string;
}

export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
  details?: Record<string, any> | string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}
