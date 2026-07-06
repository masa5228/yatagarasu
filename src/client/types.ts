export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

export type ActivityStatus = 'running' | 'completed' | 'error';

export interface Activity {
  id: string;
  agent_name: string;
  session_id: string;
  tool_name: string;
  tool_input: string | null;
  tool_result: string | null;
  hook_event: string;
  timestamp: number;
  status: ActivityStatus;
  duration_ms: number | null;
  timestamp_ms: number | null;
  tool_use_id: string | null;
}

export interface ToolCount {
  tool_name: string;
  count: number;
}

export interface AgentStats {
  name: string;
  total: number;
  errors: number;
  avg_duration_ms: number | null;
  last_ts: number;
  tools: ToolCount[];
  hourly: number[];
}
