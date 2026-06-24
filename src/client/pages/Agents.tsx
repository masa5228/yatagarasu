import { useEffect, useState, type FormEvent } from 'react';
import { api, type AgentInput } from '../lib/api';
import type { Agent } from '../types';
import styles from './Agents.module.css';

const EMPTY: AgentInput = { name: '', role: '', description: '', color: '#00ff9d' };

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<AgentInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getAgents().then(setAgents).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.updateAgent(editingId, form);
      } else {
        await api.createAgent(form);
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  }

  function edit(agent: Agent) {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      role: agent.role,
      description: agent.description ?? '',
      color: agent.color ?? '#00ff9d',
    });
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  async function remove(id: string) {
    await api.deleteAgent(id);
    if (editingId === id) cancel();
    load();
  }

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={submit}>
        <h2 className={styles.title}>{editingId ? 'Edit Agent' : 'Register Agent'}</h2>
        <label className={styles.label}>
          Name
          <input
            className={styles.input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className={styles.label}>
          Role
          <input
            className={styles.input}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
        </label>
        <label className={styles.label}>
          Description
          <textarea
            className={styles.textarea}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className={styles.label}>
          Color
          <input
            className={styles.color}
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button className={styles.primary} type="submit">
            {editingId ? 'Save' : 'Register'}
          </button>
          {editingId && (
            <button type="button" className={styles.ghost} onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className={styles.list}>
        {agents.map((agent) => (
          <li key={agent.id} className={styles.item}>
            <input
              className={styles.swatch}
              type="color"
              value={agent.color ?? '#666666'}
              readOnly
              tabIndex={-1}
            />
            <div className={styles.itemMeta}>
              <span className={styles.itemName}>{agent.name}</span>
              <span className={styles.itemRole}>{agent.role}</span>
              {agent.description && <span className={styles.itemDesc}>{agent.description}</span>}
            </div>
            <div className={styles.itemActions}>
              <button className={styles.ghost} onClick={() => edit(agent)}>
                Edit
              </button>
              <button className={styles.danger} onClick={() => remove(agent.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {agents.length === 0 && <li className={styles.emptyList}>No agents registered yet.</li>}
      </ul>
    </div>
  );
}
