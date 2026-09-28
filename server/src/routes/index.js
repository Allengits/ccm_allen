import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import userRouter from './user.routes.js';
import caseRouter from './case.routes.js';
import advocateRouter from './advocate.routes.js';
import hearingRouter from './hearing.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/cases', caseRouter);
apiRouter.use('/advocates', advocateRouter);
apiRouter.use('/hearings', hearingRouter);

export default apiRouter;
