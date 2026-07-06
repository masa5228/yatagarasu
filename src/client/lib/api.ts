import type { Agent, Activity, AgentStats } from '../types';

export interface AgentInput {
  name: string;
  role: string;
  description?: string;
  color?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: AgentInput) =>
    request<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  updateAgent: (id: string, input: AgentInput) =>
    request<Agent>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAgent: (id: string) =>
    request<void>(`/api/agents/${id}`, { method: 'DELETE' }),
  getActivities: () => request<Activity[]>('/api/activities'),
  getStats: () => request<{ agents: AgentStats[] }>('/api/stats'),
};
