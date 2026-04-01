/**
 * Generate snake draft order.
 * Odd rounds go forward (1,2,3...), even rounds go backward (...3,2,1).
 */
export function generateSnakeOrder(teamIds: string[], rounds: number): { pick_number: number; team_id: string; round: number }[] {
  const picks: { pick_number: number; team_id: string; round: number }[] = []
  let pickNumber = 0

  for (let round = 1; round <= rounds; round++) {
    const order = round % 2 === 1 ? [...teamIds] : [...teamIds].reverse()
    for (const teamId of order) {
      pickNumber++
      picks.push({ pick_number: pickNumber, team_id: teamId, round })
    }
  }

  return picks
}

/**
 * Get which team picks at a given pick number.
 */
export function getTeamForPick(teamIds: string[], pickNumber: number): { team_id: string; round: number } {
  const teamsCount = teamIds.length
  const round = Math.ceil(pickNumber / teamsCount)
  const posInRound = ((pickNumber - 1) % teamsCount)
  const index = round % 2 === 1 ? posInRound : teamsCount - 1 - posInRound
  return { team_id: teamIds[index], round }
}
