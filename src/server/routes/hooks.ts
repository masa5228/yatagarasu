import { Router } from 'express';
import { randomUUID } from 'crypto';
import { ensureAgent, insertActivity, type Activity } from '../db';
import { broadcastActivity } from '../ws';

export const hooksRouter = Router();

hooksRouter.post('/', (req, res) => {
  const body = req.body ?? {};

  const queryAgent = typeof req.query.agent === 'string' ? req.query.agent : undefined;
  const agentName: string = queryAgent ?? body.agent_type ?? body.agent_name ?? 'default';
  const sessionId: string = body.session_id ?? 'unknown';
  const toolName: string = body.tool_name ?? 'unknown';
  const hookEvent: string = body.hook_event_name ?? body.hook_event ?? 'unknown';
  const toolInput = body.tool_input !== undefined ? JSON.stringify(body.tool_input) : null;
  const rawResult = body.tool_response ?? body.tool_result;
  const toolResult = rawResult !== undefined ? JSON.stringify(rawResult) : null;

  ensureAgent(agentName);

  const activity: Activity = {
    id: randomUUID(),
    agent_name: agentName,
    session_id: sessionId,
    tool_name: toolName,
    tool_input: toolInput,
    tool_result: toolResult,
    hook_event: hookEvent,
    timestamp: Math.floor(Date.now() / 1000),
  };

  insertActivity(activity);
  broadcastActivity(activity);

  res.status(200).json({ ok: true });
});
