import { GolferScore, TeamGolfer, Team } from '@/types'

/**
 * Calculate a team's total score.
 * Only counts the best N (scoringPlayers) golfers that aren't dropped.
 * Missed cut / WD / DQ golfers get the missed cut penalty per round.
 */
export function calculateTeamTotal(
  golferScores: GolferScore[],
  teamGolfers: TeamGolfer[],
  scoringPlayers: number,
  missedCutScore: number
): number {
  const activeGolfers = teamGolfers.filter(tg => !tg.is_dropped)

  const golferTotals = activeGolfers.map(tg => {
    const scores = golferScores.filter(gs => gs.golfer_id === tg.golfer_id)
    if (scores.length === 0) return 0

    // Check if golfer was cut/wd/dq
    const latestScore = scores.find(s => s.round_number === null) || scores[0]
    if (latestScore && ['cut', 'withdrawn', 'dq'].includes(latestScore.status)) {
      // Sum actual rounds played + missed cut penalty for remaining rounds
      const playedRounds = scores.filter(s => s.round_number !== null)
      const playedTotal = playedRounds.reduce((sum, s) => sum + (s.score_to_par || 0), 0)
      const missedRounds = 4 - playedRounds.length
      return playedTotal + (missedRounds * missedCutScore)
    }

    return latestScore.total_to_par
  })

  // Sort ascending, take best N
  golferTotals.sort((a, b) => a - b)
  return golferTotals.slice(0, scoringPlayers).reduce((sum, s) => sum + s, 0)
}

/**
 * Calculate standings with tie handling.
 * Tied teams share the same rank.
 */
export function calculateStandings(
  teams: Team[],
  teamTotals: Map<string, number>
): { team_id: string; team_name: string; total: number; rank: number }[] {
  const sorted = teams
    .map(t => ({
      team_id: t.id,
      team_name: t.owner_name,
      total: teamTotals.get(t.id) || 0,
    }))
    .sort((a, b) => a.total - b.total)

  let currentRank = 1
  return sorted.map((entry, i) => {
    if (i > 0 && entry.total > sorted[i - 1].total) {
      currentRank = i + 1
    }
    return { ...entry, rank: currentRank }
  })
}
