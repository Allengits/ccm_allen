import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// Trust reverse proxy (allows rate limiting and secure cookies behind proxies / tests)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS configuration (client origin only, credentials enabled)
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// HTTP request logger (disabled during test runs)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Cookie parser for reading httpOnly JWT cookies
app.use(cookieParser());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REST API v1 routes
app.use('/api/v1', apiRouter);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

export default app;
