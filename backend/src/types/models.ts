import { SignalType } from '@prisma/client';

// Place interface 已移除，現在使用 Prisma 生成的 SafePlace 和 Place (CCTV) 類型

export interface Grid {
  id: number;
  uuid: string;
  gridId: string;
  centerLat: number;
  centerLng: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafetySignal {
  id: number;
  uuid: string;
  gridId: number;
  signal: SignalType;
  timeslot: Date;
  createdAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

