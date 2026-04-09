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

interface SlashGolfHole {
  holeId: { $numberInt: string }
  holeScore: { $numberInt: string }
  par: { $numberInt: string }
}

interface SlashGolfScorecardRound {
  orgId: string
  year: string
  tournId: string
  playerId: string
  roundId: { $numberInt: string }
  roundComplete: boolean
  currentHole: { $numberInt: string }
  currentRoundScore: string
  holes: Record<string, SlashGolfHole>
}

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

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': this.apiKey,
      },
    })

    if (!res.ok) {
      throw new Error(`Slash Golf API error: ${res.status}`)
    }

    const data: SlashGolfScorecardRound[] = await res.json()

    if (!Array.isArray(data)) return []

    return data.map(round => ({
      round_number: parseInt(round.roundId.$numberInt),
      round_complete: round.roundComplete,
      current_hole: parseInt(round.currentHole.$numberInt),
      holes: Object.values(round.holes)
        .map(h => ({
          hole_number: parseInt(h.holeId.$numberInt),
          par: parseInt(h.par.$numberInt),
          score: parseInt(h.holeScore.$numberInt),
        }))
        .sort((a, b) => a.hole_number - b.hole_number),
    }))
  }
}

export const slashGolfProvider = new SlashGolfProvider()
