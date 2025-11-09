import Redis from 'ioredis';

let redis: Redis | null = null;
let redisEnabled = false;

if (process.env.REDIS_ENABLED !== 'false') {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redis.on('error', (err) => {
      console.warn('Redis Client Error (cache disabled):', err.message);
      redisEnabled = false;
    });

    redis.on('connect', () => {
      console.log('Redis Client Connected');
      redisEnabled = true;
    });

    redis.on('ready', () => {
      console.log('Redis Client Ready');
      redisEnabled = true;
    });

    redis.connect().catch(() => {
      console.warn('Redis connection failed, cache will be disabled');
      redisEnabled = false;
    });
  } catch (error) {
    console.warn('Redis initialization failed, cache will be disabled');
    redisEnabled = false;
    redis = null;
  }
} else {
  console.log('Redis is disabled via REDIS_ENABLED=false');
}

export default redis;
export { redisEnabled };

