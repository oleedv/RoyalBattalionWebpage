export interface GracePeriodEventRow {
  id: number;
  action: string;
  squad_id: number | null;
  squad_name: string | null;
  team_id: number | null;
  attempt_number: number | null;
  reason: string | null;
  grace_remaining_seconds: number | null;
  timestamp: string;
  player_name: string | null;
  eos_id: string | null;
  steam_id: string | null;
}

export interface SwapQueueActionRow {
  id: number;
  action: string;
  priority: number | null;
  queue_position: number | null;
  from_team: number | null;
  to_team: number | null;
  reason: string | null;
  wait_time_seconds: number | null;
  timestamp: string;
  player_name: string | null;
  eos_id: string | null;
  steam_id: string | null;
}
