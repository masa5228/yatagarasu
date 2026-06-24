import { Router } from 'express';
import { getRecentActivities } from '../db';

export const activitiesRouter = Router();

activitiesRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(getRecentActivities(limit));
});
