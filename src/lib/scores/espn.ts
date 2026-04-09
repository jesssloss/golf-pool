import { ScoresProvider, Golfer, GolferScoreData } from '@/types'

const ESPN_LEADERBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'

interface ESPNCompetitor {
  id: string
  athlete?: {
    displayName?: string
    rank?: { current?: number }
  }
  status?: {
    type?: { name?: string }
    thru?: number
    period?: number
  }
  score?: string
  linescores?: { value?: number; displayValue?: string; period?: number }[]
  statistics?: { name: string; displayValue: string }[]
}

export class ESPNScoresProvider implements ScoresProvider {
  async getFieldGolfers(tournamentId: string): Promise<Golfer[]> {
    const data = await this.fetchLeaderboard(tournamentId)
    const competitors = this.extractCompetitors(data)

    return competitors
      .filter(c => c.athlete?.displayName)
      .map(c => {
        const name = c.athlete!.displayName!
        const id = name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
        return { id, name, world_ranking: c.athlete!.rank?.current || null }
      })
  }

  async getScores(tournamentId: string): Promise<GolferScoreData[]> {
    const data = await this.fetchLeaderboard(tournamentId)
    const competitors = this.extractCompetitors(data)

    return competitors
      .filter(c => c.athlete?.displayName)
      .map(c => {
        const name = c.athlete!.displayName!
        // Generate slug ID matching our internal format (same as Slash Golf provider)
        const golferId = name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')

        const rounds = (c.linescores || [])
          .filter(ls => ls.displayValue != null && ls.displayValue !== '')
          .map((ls, i) => ({
            round_number: ls.period || (i + 1),
            score_to_par: ls.displayValue === 'E' ? 0 : parseInt(ls.displayValue!, 10),
          }))
          .filter(r => !isNaN(r.score_to_par))

        const totalToPar = this.parseTotalToPar(c.score)
        const status = this.mapStatus(c.status?.type?.name || '')

        return {
          golfer_id: golferId,
          golfer_name: name,
          rounds,
          total_to_par: totalToPar,
          thru_hole: c.status?.thru || null,
          status,
          world_ranking: c.athlete!.rank?.current || null,
        }
      })
  }

  private async fetchLeaderboard(tournamentId: string): Promise<unknown> {
    const url = tournamentId
      ? `${ESPN_LEADERBOARD_URL}?event=${tournamentId}`
      : ESPN_LEADERBOARD_URL

    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) {
      throw new Error(`ESPN API error: ${res.status}`)
    }
    return res.json()
  }

  private extractCompetitors(data: unknown): ESPNCompetitor[] {
    const d = data as { events?: { competitions?: { competitors?: ESPNCompetitor[] }[] }[] }
    return d?.events?.[0]?.competitions?.[0]?.competitors || []
  }

  private parseTotalToPar(score: string | undefined): number {
    if (!score || score === 'E') return 0
    const n = parseInt(score, 10)
    return isNaN(n) ? 0 : n
  }

  private mapStatus(espnStatus: string): 'active' | 'cut' | 'withdrawn' | 'dq' {
    const s = espnStatus.toLowerCase()
    if (s.includes('cut')) return 'cut'
    if (s.includes('wd') || s.includes('withdrawn')) return 'withdrawn'
    if (s.includes('dq') || s.includes('disqualified')) return 'dq'
    return 'active'
  }
}

export const espnProvider = new ESPNScoresProvider()
