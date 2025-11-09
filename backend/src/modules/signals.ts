import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { SignalType, SafetySignal } from '@prisma/client';
import { sendSuccess } from '../utils/apiResponse';
import { getTimeslot, getGridCenter } from '../utils/geoUtils';

class SignalsModule {
  async create(gridId: string, signal: SignalType, timeslot: Date): Promise<SafetySignal> {
    const center = getGridCenter(gridId);
    const grid = await prisma.grid.upsert({
      where: { gridId },
      update: {},
      create: {
        gridId,
        centerLat: center.lat,
        centerLng: center.lng,
      },
    });
    return prisma.safetySignal.create({
      data: {
        gridId: grid.id,
        signal,
        timeslot,
      },
    });
  }

  async getStatsByGridAndTimeslot(
    gridId: string,
    timeslot: Date
  ): Promise<{ unsafe: number; ok: number; total: number }> {
    const grid = await prisma.grid.findUnique({
      where: { gridId },
    });
    if (!grid) {
      return { unsafe: 0, ok: 0, total: 0 };
    }
    const signals = await prisma.safetySignal.findMany({
      where: {
        gridId: grid.id,
        timeslot,
      },
    });
    const unsafe = signals.filter((s) => s.signal === 'unsafe').length;
    const ok = signals.filter((s) => s.signal === 'ok').length;
    return { unsafe, ok, total: signals.length };
  }

  async createSignal(req: Request, res: Response, next: NextFunction) {
    try {
      const { gridId, signal, timeslot } = req.body;
      const finalTimeslot = timeslot ? new Date(timeslot) : getTimeslot();
      await this.create(gridId, signal, finalTimeslot);
      return sendSuccess(
        res,
        { gridId, signal, timeslot: finalTimeslot },
        'Signal created successfully',
        201
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new SignalsModule();

