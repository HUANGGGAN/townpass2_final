import redis, { redisEnabled } from '../config/redis';
import logger from './logger';

export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!redisEnabled || !redis) {
    return null;
  }
  try {
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    logger.error('Cache get error', { key, error });
    return null;
  }
};

export const setCache = async (
  key: string,
  value: any,
  ttlSeconds: number
): Promise<boolean> => {
  if (!redisEnabled || !redis) {
    return false;
  }
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error('Cache set error', { key, error });
    return false;
  }
};

export const deleteCache = async (key: string): Promise<boolean> => {
  if (!redisEnabled || !redis) {
    return false;
  }
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Cache delete error', { key, error });
    return false;
  }
};

export const deleteCachePattern = async (pattern: string): Promise<boolean> => {
  if (!redisEnabled || !redis) {
    return false;
  }
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    logger.error('Cache delete pattern error', { pattern, error });
    return false;
  }
};

