export interface Pool {
  id: string
  name: string
  tournament_name: string
  invite_code: string
  status: 'lobby' | 'drafting' | 'active' | 'complete'
  commissioner_token: string
  players_per_team: number
  scoring_players: number
  missed_cut_score: number
  drop_deadline_round: number
  draft_timer_seconds: number
  buy_in_amount: number
  created_at: string
}

export interface PayoutRule {
  id: string
  pool_id: string
  position: number
  percentage: number
}

export interface Team {
  id: string
  pool_id: string
  owner_name: string
  session_token: string
  draft_position: number | null
  is_commissioner: boolean
  buy_in_paid: boolean
  created_at: string
}

export interface DraftState {
  id: string
  pool_id: string
  current_pick: number
  total_picks: number
  is_paused: boolean
  timer_expires_at: string | null
  updated_at: string
}

export interface DraftPick {
  id: string
  pool_id: string
  team_id: string
  golfer_id: string
  golfer_name: string
  pick_number: number
  round: number
  picked_at: string
}

export interface TeamGolfer {
  id: string
  pool_id: string
  team_id: string
  golfer_id: string
  golfer_name: string
  is_dropped: boolean
  dropped_at: string | null
}

export interface GolferScore {
  id: string
  pool_id: string
  golfer_id: string
  golfer_name: string
  round_number: number | null
  score_to_par: number | null
  total_to_par: number
  thru_hole: number | null
  status: 'active' | 'cut' | 'withdrawn' | 'dq'
  world_ranking: number | null
  updated_at: string
}

export interface Payment {
  id: string
  pool_id: string
  team_id: string
  type: 'buy_in' | 'payout'
  amount: number
  status: 'pending' | 'paid' | 'sent'
  method: string
  created_at: string
}

// Scores adapter interface
export interface Golfer {
  id: string
  name: string
  world_ranking: number | null
}

export interface ScoresProvider {
  getFieldGolfers(tournamentId: string): Promise<Golfer[]>
  getScores(tournamentId: string): Promise<GolferScoreData[]>
}

export interface GolferScoreData {
  golfer_id: string
  golfer_name: string
  rounds: { round_number: number; score_to_par: number }[]
  total_to_par: number
  thru_hole: number | null
  status: 'active' | 'cut' | 'withdrawn' | 'dq'
  world_ranking: number | null
}

export interface Standing {
  team_id: string
  team_name: string
  total: number
  rank: number
  golfer_scores: {
    golfer_id: string
    golfer_name: string
    is_dropped: boolean
    rounds: (number | null)[]
    total: number
    status: string
  }[]
}

export interface PayoutResult {
  team_id: string
  team_name: string
  rank: number
  amount: number
}
