import { PayoutRule, PayoutResult } from '@/types'

/**
 * Calculate payouts with tie-splitting logic.
 * Tied teams that span paid positions split the combined prize money equally.
 */
export function calculatePayouts(
  standings: { team_id: string; team_name: string; total: number; rank: number }[],
  payoutRules: PayoutRule[],
  prizePool: number
): PayoutResult[] {
  const results: PayoutResult[] = []

  // Group teams by rank
  const rankGroups = new Map<number, typeof standings>()
  for (const entry of standings) {
    const group = rankGroups.get(entry.rank) || []
    group.push(entry)
    rankGroups.set(entry.rank, group)
  }

  // Sort payout rules by position
  const rules = [...payoutRules].sort((a, b) => a.position - b.position)

  // Process each rank group
  for (const [rank, group] of Array.from(rankGroups.entries())) {
    // Find all payout positions this group spans
    // E.g., if 3 teams tied for 2nd, they span positions 2, 3, 4
    const spannedPositions: number[] = []
    for (let i = 0; i < group.length; i++) {
      const position = rank + i
      spannedPositions.push(position)
    }

    // Sum percentages for spanned positions that have payout rules
    const totalPercentage = spannedPositions.reduce((sum, pos) => {
      const rule = rules.find(r => r.position === pos)
      return sum + (rule?.percentage || 0)
    }, 0)

    const splitAmount = totalPercentage > 0
      ? (prizePool * totalPercentage / 100) / group.length
      : 0

    for (const entry of group) {
      results.push({
        team_id: entry.team_id,
        team_name: entry.team_name,
        rank: entry.rank,
        amount: Math.round(splitAmount * 100) / 100,
      })
    }
  }

  return results
}
