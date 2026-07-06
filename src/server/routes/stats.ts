import { Router } from 'express';
import { getAgentStats } from '../db';

export const statsRouter = Router();

statsRouter.get('/', (_req, res) => {
  res.json({ agents: getAgentStats() });
});
