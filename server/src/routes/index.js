import { Router } from 'express';
import healthRouter from './health.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);

export default apiRouter;
