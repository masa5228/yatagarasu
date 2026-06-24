export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

export interface Activity {
  id: string;
  agent_name: string;
  session_id: string;
  tool_name: string;
  tool_input: string | null;
  tool_result: string | null;
  hook_event: string;
  timestamp: number;
}
