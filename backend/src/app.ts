import express, { Express } from 'express';
import { setupSecurity } from './middlewares/security';
import { errorHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimiter';
import { API_PREFIX } from './config/constants';
import apiRoutes from './routes';

const app: Express = express();

setupSecurity(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 公開端點（不需要 JWT）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(apiLimiter);
app.use(API_PREFIX, apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

app.use(errorHandler);

export default app;

