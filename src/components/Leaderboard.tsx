'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, TeamGolfer, GolferScore } from '@/types'
import { MILESTONE_COPY, EMPTY_STATE_COPY } from '@/lib/constants/copy'
import FlipScore from './FlipScore'
import StatusBadge from './StatusBadge'
import GreenJacketIcon from './GreenJacketIcon'
import MilestoneBanner from './MilestoneBanner'
import GreenJacketCard from './GreenJacketCard'

interface Props {
  poolId: string
  pool: Pool
}

interface TeamStanding {
  team: Team
  golfers: (TeamGolfer & { scores: GolferScore[]; total: number; status: string })[]
  teamTotal: number
  rank: number
}

export default function Leaderboard({ poolId, pool }: Props) {
  const supabase = createClient()
  const [standings, setStandings] = useState<TeamStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [showJacketCard, setShowJacketCard] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadStandings = useCallback(async () => {
    const [teamsRes, tgRes, scoresRes] = await Promise.all([
      supabase.from('teams').select('*').eq('pool_id', poolId),
      supabase.from('team_golfers').select('*').eq('pool_id', poolId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId),
    ])

    const teams = teamsRes.data || []
    const teamGolfers = tgRes.data || []
    const allScores = scoresRes.data || []

    const teamStandings: TeamStanding[] = teams.map(team => {
      const golfers = teamGolfers
        .filter(tg => tg.team_id === team.id)
        .map(tg => {
          const scores = allScores.filter(s => s.golfer_id === tg.golfer_id)
          const roundScores = scores.filter(s => s.round_number !== null)
          const latestStatus = scores.find(s => s.round_number === null) || scores[0]
          const isCutWdDq = latestStatus && ['cut', 'withdrawn', 'dq'].includes(latestStatus.status)

          let total: number
          if (isCutWdDq) {
            const playedTotal = roundScores.reduce((sum, s) => sum + (s.score_to_par || 0), 0)
            const missedRounds = 4 - roundScores.length
            total = playedTotal + (missedRounds * pool.missed_cut_score)
          } else {
            total = latestStatus?.total_to_par || 0
          }

          return { ...tg, scores, total, status: latestStatus?.status || 'active' }
        })

      const activeGolfers = golfers.filter(g => !g.is_dropped)
      activeGolfers.sort((a, b) => a.total - b.total)
      const scoringGolfers = activeGolfers.slice(0, pool.scoring_players)
      const teamTotal = scoringGolfers.reduce((sum, g) => sum + g.total, 0)

      return { team, golfers, teamTotal, rank: 0 }
    })

    teamStandings.sort((a, b) => a.teamTotal - b.teamTotal)
    let currentRank = 1
    teamStandings.forEach((s, i) => {
      if (i > 0 && s.teamTotal > teamStandings[i - 1].teamTotal) {
        currentRank = i + 1
      }
      s.rank = currentRank
    })

    setStandings(teamStandings)
    setLoading(false)
    setLastUpdated(new Date())
  }, [poolId, pool, supabase])

  useEffect(() => { loadStandings() }, [loadStandings])

  // Realtime subscription for instant updates when cron writes scores
  useEffect(() => {
    const channel = supabase
      .channel('scores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golfer_scores', filter: `pool_id=eq.${poolId}` }, () => loadStandings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_golfers', filter: `pool_id=eq.${poolId}` }, () => loadStandings())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, supabase, loadStandings])

  // Auto-refresh: pull fresh ESPN scores every 60s for active pools
  useEffect(() => {
    if (pool.status !== 'active') return
    const interval = setInterval(async () => {
      await fetch(`/api/pools/${poolId}/scores/refresh`, { method: 'POST' })
      // Realtime subscription will pick up the DB changes automatically,
      // but loadStandings as fallback
      loadStandings()
    }, 60_000)
    return () => clearInterval(interval)
  }, [pool.status, poolId, loadStandings])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch(`/api/pools/${poolId}/scores/refresh`, { method: 'POST' })
      await loadStandings()
    } finally {
      setRefreshing(false)
    }
  }

  function formatScore(score: number): string {
    if (score === 0) return 'E'
    return score > 0 ? `+${score}` : `${score}`
  }

  function scoreColor(score: number): string {
    if (score < 0) return 'text-score-green'
    if (score > 0) return 'text-score-red'
    return 'text-gray-900'
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="font-serif italic text-muted-gray">{EMPTY_STATE_COPY.waitingFirstRound}</p>
      </main>
    )
  }

  const isComplete = pool.status === 'complete'
  const winner = isComplete && standings.length > 0 ? standings[0] : null

  // Check if any round 4 scores exist (Final Round label)
  const hasR4 = standings.some(s => s.golfers.some(g => g.scores.some(sc => sc.round_number === 4)))

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-serif font-bold text-augusta">{pool.name}</h1>
            <p className="text-sm text-muted-gray">{pool.tournament_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-gray">
                Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="text-sm px-3 py-1 border border-augusta text-augusta rounded-sm hover:bg-augusta hover:text-white transition-colors disabled:opacity-50"
            >
              {refreshing ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Milestone banners */}
        {isComplete && winner && (
          <MilestoneBanner text={MILESTONE_COPY.poolFinalized(pool.name)} />
        )}

        {/* Green Jacket Card overlay */}
        {showJacketCard && winner && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowJacketCard(false)}>
            <div onClick={e => e.stopPropagation()}>
              <GreenJacketCard
                winnerName={winner.team.owner_name}
                poolName={pool.name}
                winningScore={formatScore(winner.teamTotal)}
              />
              <p className="text-center text-cream/60 text-xs mt-4 font-sans">Tap outside to close</p>
            </div>
          </div>
        )}

        {/* Scoreboard table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-augusta text-cream">
                <th className="px-3 py-2 text-left font-serif font-bold w-10">#</th>
                <th className="px-3 py-2 text-left font-serif font-bold">Team</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R1</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R2</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R3</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">{hasR4 ? 'Final' : 'R4'}</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, idx) => {
                const isWinner = isComplete && s.rank === 1
                // Calculate team round totals from best scoring golfers
                const activeGolfers = s.golfers.filter(g => !g.is_dropped)
                activeGolfers.sort((a, b) => a.total - b.total)
                const scoringGolfers = activeGolfers.slice(0, pool.scoring_players)

                const roundTotals = [1, 2, 3, 4].map(r => {
                  const scores = scoringGolfers
                    .map(g => g.scores.find(sc => sc.round_number === r)?.score_to_par)
                    .filter((sc): sc is number => sc !== null && sc !== undefined)
                  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) : null
                })

                return (
                  <tr
                    key={s.team.id}
                    className={`border-b border-muted-gray/20 ${isWinner ? 'bg-masters-gold/10' : idx % 2 === 0 ? 'bg-white' : 'bg-cream'}`}
                  >
                    <td className="px-3 py-3 font-serif font-bold text-muted-gray">
                      {isWinner && <span className="border-l-2 border-masters-gold -ml-3 pl-2.5" />}
                      {s.rank}
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/pool/${poolId}/team/${s.team.id}`} className="hover:underline">
                        <span className="font-serif font-semibold">
                          {isWinner && <GreenJacketIcon size={16} />}
                          {' '}{s.team.owner_name}
                        </span>
                      </Link>
                      {/* Inline golfer list */}
                      <div className="mt-1 space-y-0.5">
                        {s.golfers.map(g => (
                          <div key={g.golfer_id} className={`text-xs flex items-center gap-1 ${g.is_dropped ? 'line-through text-muted-gray opacity-50' : ''}`}>
                            <span className="truncate">{g.golfer_name}</span>
                            {!g.is_dropped && g.status !== 'active' && (
                              <StatusBadge status={g.status as 'cut' | 'withdrawn' | 'dq'} />
                            )}
                            {g.is_dropped && <StatusBadge status="dropped" />}
                          </div>
                        ))}
                      </div>
                    </td>
                    {roundTotals.map((rt, i) => (
                      <td key={i} className={`px-3 py-3 text-center font-mono ${rt !== null ? scoreColor(rt) : 'text-muted-gray'}`}>
                        {rt !== null ? <FlipScore value={formatScore(rt)} /> : '-'}
                      </td>
                    ))}
                    <td className={`px-3 py-3 text-center font-mono font-bold ${scoreColor(s.teamTotal)}`}>
                      <FlipScore value={formatScore(s.teamTotal)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* View Champion button */}
        {isComplete && winner && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowJacketCard(true)}
              className="px-6 py-2 bg-augusta text-white font-serif rounded-sm hover:bg-augusta-dark transition-colors"
            >
              View Champion
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
