'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, TeamGolfer, GolferScore } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import FlipScore from '@/components/FlipScore'
import GreenJacketIcon from '@/components/GreenJacketIcon'

export default function PublicTeamDetail() {
  const params = useParams()
  const slug = params.slug as string
  const teamId = params.teamId as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [golfers, setGolfers] = useState<(TeamGolfer & { scores: GolferScore[] })[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    // Look up pool by slug
    const { data: poolData } = await supabase
      .from('pools')
      .select('id, name, tournament_name, invite_code, status, players_per_team, scoring_players, missed_cut_score, drop_deadline_round, draft_timer_seconds, draft_mode, slug, buy_in_amount, payment_method, payment_details, created_at')
      .eq('slug', slug)
      .single()

    if (!poolData) { setLoading(false); return }
    setPool(poolData as Pool)

    const [teamRes, tgRes, scoresRes] = await Promise.all([
      supabase.from('teams').select('id, pool_id, owner_name, draft_position, is_commissioner, buy_in_paid, created_at').eq('id', teamId).single(),
      supabase.from('team_golfers').select('*').eq('pool_id', poolData.id).eq('team_id', teamId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolData.id),
    ])

    if (teamRes.data) setTeam(teamRes.data as Team)
    if (tgRes.data && scoresRes.data) {
      setGolfers(tgRes.data.map(tg => ({
        ...tg,
        scores: scoresRes.data!.filter(s => s.golfer_id === tg.golfer_id),
      })))
    }
    setLoading(false)
  }, [slug, teamId, supabase])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">Loading...</p>
      </main>
    )
  }

  if (!pool || !team) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="text-score-red mt-3">Team not found</p>
      </main>
    )
  }

  const hasR4 = golfers.some(g => g.scores.some(sc => sc.round_number === 4))

  function formatScore(score: number): string {
    if (score === 0) return 'E'
    return score > 0 ? `+${score}` : `${score}`
  }

  function scoreColor(score: number): string {
    if (score < 0) return 'text-score-green'
    if (score > 0) return 'text-score-red'
    return 'text-gray-900'
  }

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href={`/p/${slug}`} className="text-sm text-pimento hover:underline mb-4 block min-h-[44px] flex items-center">
          Back to Leaderboard
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <GreenJacketIcon size={24} />
          <h1 className="text-2xl font-serif font-bold text-pimento">{team.owner_name}</h1>
        </div>
        <p className="text-sm text-muted-gray mb-2">
          Best {pool.scoring_players} of {pool.players_per_team} golfers count
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-pimento text-cream">
                <th className="px-4 py-2 text-left font-serif font-bold">Golfer</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R1</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R2</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R3</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">{hasR4 ? 'Final' : 'R4'}</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">Total</th>
              </tr>
            </thead>
            <tbody>
              {golfers.map((g, idx) => {
                const roundScores = [1, 2, 3, 4].map(r => {
                  const score = g.scores.find(s => s.round_number === r)
                  return score?.score_to_par ?? null
                })
                const latestScore = g.scores.find(s => s.round_number === null) || g.scores[0]
                const total = latestScore?.total_to_par || 0
                const status = latestScore?.status || 'active'
                const isMissedCut = ['cut', 'withdrawn', 'dq'].includes(status)

                return (
                  <tr
                    key={g.golfer_id}
                    className={`border-b border-muted-gray/20 ${
                      g.is_dropped ? 'opacity-50' : idx % 2 === 0 ? 'bg-white' : 'bg-cream'
                    }`}
                  >
                    <td className={`px-4 py-3 ${g.is_dropped ? 'line-through text-muted-gray' : ''}`}>
                      <span className="font-serif font-medium">{g.golfer_name}</span>
                      {g.is_dropped && <StatusBadge status="dropped" />}
                      {!g.is_dropped && status !== 'active' && (
                        <StatusBadge status={status as 'cut' | 'withdrawn' | 'dq'} />
                      )}
                      {!g.is_dropped && latestScore?.thru_hole && latestScore.thru_hole < 18 && status === 'active' && (
                        <div className="text-[10px] text-muted-gray font-sans mt-0.5">thru {latestScore.thru_hole}</div>
                      )}
                    </td>
                    {roundScores.map((score, i) => {
                      const isMissedCutRound = isMissedCut && score !== null && i >= (latestScore?.thru_hole === null ? 2 : 4)
                      return (
                        <td key={i} className={`px-2 py-3 text-center font-mono ${
                          g.is_dropped ? 'text-muted-gray' :
                          isMissedCutRound ? 'text-muted-gray italic' :
                          score !== null ? scoreColor(score) : 'text-muted-gray/40'
                        }`}>
                          {score !== null ? <FlipScore value={formatScore(score)} /> : '-'}
                        </td>
                      )
                    })}
                    <td className={`px-2 py-3 text-center font-mono font-bold ${
                      g.is_dropped ? 'text-muted-gray' : scoreColor(total)
                    }`}>
                      <FlipScore value={formatScore(total)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
