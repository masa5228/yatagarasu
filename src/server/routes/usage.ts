import { Router } from 'express';
import { getUsageSnapshot } from '../usage';

export const usageRouter = Router();

usageRouter.get('/', (_req, res) => {
  res.json(getUsageSnapshot());
});
