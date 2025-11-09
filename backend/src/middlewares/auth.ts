import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uuid: string;
        account: string;
      };
    }
  }
}


export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AppError('No authorization token provided', 401));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AppError('Invalid authorization header format. Expected: Bearer <token>', 401));
  }

  const token = parts[1];

  if (!token) {
    return next(new AppError('No token provided', 401));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return next(new AppError('JWT secret not configured', 500));
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { uuid: string; account: string; iat?: number; exp?: number };
    
    req.user = {
      uuid: decoded.uuid,
      account: decoded.account,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token has expired', 401));
    } else if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    } else {
      return next(new AppError('Token verification failed', 401));
    }
  }
};


export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(); 
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next(); 
    }

    const token = parts[1];
    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as { uuid: string; account: string };
      req.user = {
        uuid: decoded.uuid,
        account: decoded.account,
      };
    } catch (error) {

    }

    next();
  } catch (error) {
    next();
  }
};

