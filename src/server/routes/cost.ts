import { Router } from 'express';
import { scanCost } from '../usage';

export const costRouter = Router();

costRouter.get('/', (req, res) => {
  const raw = Number(req.query.days);
  const days = Number.isFinite(raw) && raw > 0 ? raw : undefined;
  res.json(scanCost({ windowDays: days }));
});
