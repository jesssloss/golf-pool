import type { GolferScoreData } from '@/types'

const RAPIDAPI_HOST = 'live-golf-data.p.rapidapi.com'
const BASE_URL = `https://${RAPIDAPI_HOST}`

/** Pro tier: 2000 calls/month */
export const MONTHLY_CALL_LIMIT = 2000

/**
 * Daily budget: spread calls across tournament days with a reserve.
 * Masters is 4 rounds (Thu-Sun) + possible playoff.
 * Reserve 200 calls for playoff/overflow, split the rest across 5 days.
 * 5 days * 360/day = 1800 + 200 reserve = 2000
 */
export const DAILY_CALL_BUDGET = 360
export const PLAYOFF_RESERVE = 200

// --- Scorecard types ---

interface SlashGolfHole {
  holeId: number | string | { $numberInt: string }
  holeScore: number | string | { $numberInt: string }
  par: number | string | { $numberInt: string }
}

interface SlashGolfScorecardRound {
  orgId: string
  year: string
  tournId: string
  playerId: string
  roundId: number | string | { $numberInt: string }
  roundComplete: boolean
  currentHole: number | string | { $numberInt: string }
  currentRoundScore: string
  holes: Record<string, SlashGolfHole>
}

// --- Leaderboard types ---

interface SlashGolfLeaderboardEntry {
  playerId: string
  firstName: string
  lastName: string
  totalScore?: string
  total?: string | { $numberInt: string }
  toPar?: string | number | { $numberInt: string }
  thru?: string | number | { $numberInt: string }
  currentRound?: string | { $numberInt: string }
  round1?: string | { $numberInt: string }
  round2?: string | { $numberInt: string }
  round3?: string | { $numberInt: string }
  round4?: string | { $numberInt: string }
  status?: string
  isActive?: boolean
  position?: string | number
  [key: string]: unknown
}

// --- Exported types ---

export interface HoleScore {
  hole_number: number
  par: number
  score: number
}

export interface RoundScorecard {
  round_number: number
  round_complete: boolean
  current_hole: number
  holes: HoleScore[]
}

export class SlashGolfProvider {
  private apiKey: string

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || ''
  }

  private get headers() {
    return {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': this.apiKey,
    }
  }

  /**
   * Fetch leaderboard - returns all golfer scores in one call.
   * This is the primary scoring source.
   */
  async getLeaderboard(
    tournId: string = '014',
    year: string = '2026',
    orgId: string = '1'
  ): Promise<GolferScoreData[]> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY not configured')
    }

    const url = `${BASE_URL}/leaderboard?orgId=${orgId}&tournId=${tournId}&year=${year}`

    const res = await fetch(url, { headers: this.headers })

    if (!res.ok) {
      throw new Error(`Slash Golf leaderboard API error: ${res.status}`)
    }

    const data = await res.json()

    // The API may return the leaderboard in various wrapper formats
    const entries: SlashGolfLeaderboardEntry[] = Array.isArray(data)
      ? data
      : data?.leaderboard || data?.results || data?.players || []

    if (!Array.isArray(entries)) return []

    return entries.map(entry => this.parseLeaderboardEntry(entry)).filter(Boolean) as GolferScoreData[]
  }

  private parseLeaderboardEntry(entry: SlashGolfLeaderboardEntry): GolferScoreData | null {
    if (!entry.playerId) return null

    const name = `${entry.firstName || ''} ${entry.lastName || ''}`.trim()
    if (!name) return null

    // Build golfer_id slug from name (matches our internal ID format)
    const golferId = name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')

    // Parse total to par
    const totalToPar = this.parseNumberField(entry.toPar, entry.totalScore, entry.total)

    // Parse thru hole
    const thru = this.parseThru(entry.thru)

    // Parse per-round scores
    const rounds: { round_number: number; score_to_par: number }[] = []
    for (let r = 1; r <= 4; r++) {
      const roundKey = `round${r}` as keyof SlashGolfLeaderboardEntry
      const roundVal = entry[roundKey]
      if (roundVal !== undefined && roundVal !== null && roundVal !== '' && roundVal !== '--') {
        const strokes = this.parseBsonInt(roundVal)
        if (strokes !== null && strokes > 0) {
          rounds.push({ round_number: r, score_to_par: strokes - 72 }) // Augusta par 72
        }
      }
    }

    // Parse status
    const status = this.parseStatus(entry.status, entry.isActive)

    return {
      golfer_id: golferId,
      golfer_name: name,
      rounds,
      total_to_par: totalToPar,
      thru_hole: thru,
      status,
      world_ranking: null, // Leaderboard may not include this
    }
  }

  private parseNumberField(...candidates: unknown[]): number {
    for (const val of candidates) {
      if (val === null || val === undefined || val === '' || val === '--') continue
      if (typeof val === 'number') return val
      if (typeof val === 'string') {
        if (val === 'E' || val === 'Even') return 0
        const n = parseInt(val, 10)
        if (!isNaN(n)) return n
      }
      if (typeof val === 'object' && val !== null && '$numberInt' in val) {
        const n = parseInt((val as { $numberInt: string }).$numberInt, 10)
        if (!isNaN(n)) return n
      }
    }
    return 0
  }

  private parseThru(val: unknown): number | null {
    if (val === null || val === undefined || val === '' || val === '--' || val === 'F') return null
    if (val === 'F' || val === 'f') return 18
    const n = this.parseBsonInt(val)
    return n !== null && n >= 0 ? n : null
  }

  private parseBsonInt(val: unknown): number | null {
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      if (val === 'E' || val === 'Even') return 0
      const n = parseInt(val, 10)
      return isNaN(n) ? null : n
    }
    if (typeof val === 'object' && val !== null && '$numberInt' in val) {
      return parseInt((val as { $numberInt: string }).$numberInt, 10)
    }
    return null
  }

  private parseStatus(status: unknown, isActive: unknown): 'active' | 'cut' | 'withdrawn' | 'dq' {
    if (typeof status === 'string') {
      const s = status.toLowerCase()
      if (s.includes('cut')) return 'cut'
      if (s.includes('wd') || s.includes('withdrawn')) return 'withdrawn'
      if (s.includes('dq') || s.includes('disqualified')) return 'dq'
    }
    if (isActive === false) return 'cut' // Conservative assumption
    return 'active'
  }

  /**
   * Fetch per-golfer scorecard for hole-by-hole detail.
   */
  async getScorecard(
    playerId: string,
    tournId: string = '014',
    year: string = '2026',
    orgId: string = '1'
  ): Promise<RoundScorecard[]> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY not configured')
    }

    const url = `${BASE_URL}/scorecard?orgId=${orgId}&tournId=${tournId}&year=${year}&playerId=${playerId}`

    const res = await fetch(url, { headers: this.headers })

    if (!res.ok) {
      throw new Error(`Slash Golf API error: ${res.status}`)
    }

    const data: SlashGolfScorecardRound[] = await res.json()

    if (!Array.isArray(data)) return []

    return data.map(round => {
      const roundNum = this.parseBsonInt(round.roundId)
      const currentHole = this.parseBsonInt(round.currentHole)

      return {
        round_number: roundNum ?? 0,
        round_complete: round.roundComplete,
        current_hole: currentHole ?? 0,
        holes: Object.values(round.holes)
          .map(h => ({
            hole_number: this.parseBsonInt(h.holeId) ?? 0,
            par: this.parseBsonInt(h.par) ?? 0,
            score: this.parseBsonInt(h.holeScore) ?? 0,
          }))
          .filter(h => h.hole_number > 0 && h.par > 0)
          .sort((a, b) => a.hole_number - b.hole_number),
      }
    }).filter(r => r.round_number > 0)
  }
}

export const slashGolfProvider = new SlashGolfProvider()
