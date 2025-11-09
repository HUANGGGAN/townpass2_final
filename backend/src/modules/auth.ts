import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../middlewares/errorHandler';

class AuthModule {
  /**
   * POST /api/auth/login
   * 登入並獲取 JWT token
   * 使用 uuid + idNo 兩個驗證，兩個都對才發 token
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid, idNo } = req.body as {
        uuid: string;
        idNo: string;
      };

      if (!uuid || !idNo) {
        throw new AppError('Missing required fields: uuid, idNo', 400);
      }

      const identity = await prisma.identity.findUnique({
        where: { uuid },
      });

      if (!identity) {
        throw new AppError('Invalid credentials', 401);
      }

      if (identity.idNo !== idNo) {
        throw new AppError('Invalid credentials', 401);
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new AppError('JWT secret not configured', 500);
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as string;
      const token = jwt.sign(
        {
          uuid: identity.uuid,
          account: identity.account,
        },
        jwtSecret,
        {
          expiresIn,
        } as jwt.SignOptions
      );
      console.log("success");

      return sendSuccess(
        res,
        {
          token,
          user: {
            uuid: identity.uuid,
            account: identity.account,
            name: identity.name,
          },
        },
        'Login successful'
      );
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { account, idNo, name } = req.body as {
        account: string;
        idNo: string;
        name: string;
      };

      if (!account || !idNo || !name) {
        throw new AppError('Missing required fields: account, idNo, name', 400);
      }

      const existing = await prisma.identity.findUnique({
        where: { account },
      });

      if (existing) {
        throw new AppError('Account already exists', 409);
      }

      const existingIdNo = await prisma.identity.findFirst({
        where: { idNo },
      });

      if (existingIdNo) {
        throw new AppError('ID number already registered', 409);
      }

      const identity = await prisma.identity.create({
        data: {
          account,
          idNo,
          name,
          uuid: randomUUID(),
          count: 0,
        } as any,
      });

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new AppError('JWT secret not configured', 500);
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as string;
      const token = jwt.sign(
        {
          uuid: identity.uuid,
          account: identity.account,
        },
        jwtSecret,
        {
          expiresIn,
        } as jwt.SignOptions
      );
      console.log("success");
      return sendSuccess(
        res,
        {
          token,
          user: {
            uuid: identity.uuid,
            account: identity.account,
            name: identity.name,
          },
        },
        'Registration successful',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401);
      }

      const identity = await prisma.identity.findUnique({
        where: { uuid: req.user.uuid },
        select: {
          uuid: true,
          account: true,
          name: true,
          count: true,
          createdAt: true,
        } as any,
      });

      if (!identity) {
        throw new AppError('User not found', 404);
      }

      return sendSuccess(
        res,
        {
          user: identity,
        },
        'User information retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthModule();

