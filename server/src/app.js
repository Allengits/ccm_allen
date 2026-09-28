import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// HTTP request logger
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));

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
