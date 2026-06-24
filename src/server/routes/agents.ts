import { Router } from 'express';
import {
  getAgents,
  getAgentById,
  getAgentByName,
  createAgent,
  updateAgent,
  deleteAgent,
} from '../db';

export const agentsRouter = Router();

agentsRouter.get('/', (_req, res) => {
  res.json(getAgents());
});

agentsRouter.post('/', (req, res) => {
  const { name, role, description, color } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (getAgentByName(name)) {
    res.status(400).json({ error: 'name already exists' });
    return;
  }
  const agent = createAgent({ name, role, description, color });
  res.status(201).json(agent);
});

agentsRouter.put('/:id', (req, res) => {
  const { name, role, description, color } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!getAgentById(req.params.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const duplicate = getAgentByName(name);
  if (duplicate && duplicate.id !== req.params.id) {
    res.status(400).json({ error: 'name already exists' });
    return;
  }
  const updated = updateAgent(req.params.id, { name, role, description, color });
  res.json(updated);
});

agentsRouter.delete('/:id', (req, res) => {
  if (!deleteAgent(req.params.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(204).end();
});
