'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getTeamForPick } from '@/lib/utils/snake-draft'
import type { Pool, Team, DraftState, DraftPick, GolferScore } from '@/types'
import MilestoneBanner from '@/components/MilestoneBanner'
import { MILESTONE_COPY, EMPTY_STATE_COPY } from '@/lib/constants/copy'
import GreenJacketIcon from '@/components/GreenJacketIcon'
import ManualDraftEntry from '@/components/ManualDraftEntry'

export default function DraftPage() {
  const params = useParams()
  const router = useRouter()
  const poolId = params.id as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [golfers, setGolfers] = useState<GolferScore[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [autoPickTriggered, setAutoPickTriggered] = useState(false)
  const [pendingPick, setPendingPick] = useState<{ golfer_id: string; golfer_name: string } | null>(null)

  const pickerRef = useRef<HTMLDivElement>(null)
  const hasRedirected = useRef(false)

  const loadData = useCallback(async () => {
    const [poolRes, teamsRes, draftRes, picksRes, golfersRes] = await Promise.all([
      supabase.from('pools').select('*').eq('id', poolId).single(),
      supabase.from('teams').select('*').eq('pool_id', poolId).order('draft_position'),
      supabase.from('draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId).is('round_number', null),
    ])

    if (poolRes.data) setPool(poolRes.data)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (draftRes.data) setDraftState(draftRes.data)
    if (picksRes.data) setPicks(picksRes.data)
    if (golfersRes.data) setGolfers(golfersRes.data)

    const meRes = await fetch(`/api/pools/${poolId}/me`)
    if (meRes.ok) {
      const data = await meRes.json()
      if (data.team) setCurrentTeam(data.team)
    }

    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('draft-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `pool_id=eq.${poolId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state', filter: `pool_id=eq.${poolId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pools', filter: `id=eq.${poolId}` }, () => loadData())
      .subscribe()

    const pollInterval = setInterval(loadData, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [poolId, supabase, loadData])

  useEffect(() => {
    if (!draftState?.timer_expires_at) {
      setTimeLeft(null)
      return
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(
        (new Date(draftState.timer_expires_at!).getTime() - Date.now()) / 1000
      ))
      setTimeLeft(remaining)
    }, 1000)

    return () => clearInterval(interval)
  }, [draftState?.timer_expires_at])

  useEffect(() => {
    if (pool?.status === 'active' && !hasRedirected.current) {
      hasRedirected.current = true
      router.push(`/pool/${poolId}`)
    }
  }, [pool?.status, poolId, router])

  // Reset state when the pick advances
  const prevPickRef = useRef(draftState?.current_pick)
  useEffect(() => {
    if (draftState?.current_pick !== prevPickRef.current) {
      prevPickRef.current = draftState?.current_pick
      setAutoPickTriggered(false)
      setPendingPick(null)
      setPickError('')
    }
  }, [draftState?.current_pick])

  if (loading || !pool || !draftState) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">{EMPTY_STATE_COPY.draftBoardEmpty}</p>
      </main>
    )
  }

  const teamIds = teams.map(t => t.id)
  const isComplete = draftState.current_pick > draftState.total_picks
  const currentPickInfo = !isComplete ? getTeamForPick(teamIds, draftState.current_pick) : null
  const pickingTeam = currentPickInfo ? teams.find(t => t.id === currentPickInfo.team_id) : null
  const isMyTurn = currentTeam && pickingTeam && currentTeam.id === pickingTeam.id
  const isCommissioner = currentTeam && pool.commissioner_token === currentTeam.session_token
  const isManualMode = pool.draft_mode === 'manual'
  const isUnlimitedTimer = pool.draft_timer_seconds === 0

  // Manual mode: non-commissioners see a waiting message
  if (isManualMode && !isCommissioner && !loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <GreenJacketIcon size={32} />
        <p className="font-serif italic text-muted-gray mt-3 text-center">
          Your commissioner is entering picks. Check back soon.
        </p>
      </main>
    )
  }

  // Manual mode: commissioner gets the batch entry UI
  if (isManualMode && isCommissioner) {
    return (
      <main className="min-h-screen py-4 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <GreenJacketIcon size={24} />
            <h1 className="text-2xl font-serif font-bold text-pimento">Enter Draft Results</h1>
          </div>
          <ManualDraftEntry
            poolId={poolId}
            teams={teams}
            golfers={golfers}
            playersPerTeam={pool.players_per_team}
            existingPicks={picks.map(p => ({ team_id: p.team_id, golfer_id: p.golfer_id, golfer_name: p.golfer_name }))}
            onPicksSaved={loadData}
            onFinalize={finalizeDraft}
            finalizing={picking}
          />
        </div>
      </main>
    )
  }

  const pickedGolferIds = new Set(picks.map(p => p.golfer_id))
  const availableGolfers = golfers
    .filter(g => !pickedGolferIds.has(g.golfer_id))
    .filter(g => !search || g.golfer_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))

  async function makePick(golferId: string, golferName: string) {
    setPicking(true)
    setPickError('')
    try {
      const res = await fetch(`/api/pools/${poolId}/draft/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golferId, golferName }),
      })
      if (!res.ok) {
        const data = await res.json()
        setPickError(data.error || 'Failed to make pick')
      }
      setSearch('')
      await loadData()
    } catch {
      setPickError('Failed to make pick. Check your connection.')
    }
    setPicking(false)
  }

  async function autoPickBestAvailable() {
    if (autoPickTriggered || picking) return
    setAutoPickTriggered(true)
    const pickedIds = new Set(picks.map(p => p.golfer_id))
    const best = golfers
      .filter(g => !pickedIds.has(g.golfer_id))
      .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))[0]
    if (best) {
      await makePick(best.golfer_id, best.golfer_name)
    }
  }

  async function finalizeDraft() {
    setPicking(true)
    try {
      const res = await fetch(`/api/pools/${poolId}/draft/finalize`, { method: 'POST' })
      if (res.ok) {
        hasRedirected.current = true
        router.push(`/pool/${poolId}`)
      } else {
        const data = await res.json()
        setPickError(data.error || 'Failed to finalize draft')
      }
    } catch {
      setPickError('Failed to finalize draft. Check your connection.')
    }
    setPicking(false)
  }

  // Auto-scroll to picker on mobile when it's your turn
  const shouldShowPickerFirst = isManualMode ? true : (isMyTurn || (isCommissioner && timeLeft === 0))

  const rounds = pool.players_per_team
  const draftBoard: (DraftPick | null)[][] = []
  for (let r = 0; r < rounds; r++) {
    const row: (DraftPick | null)[] = []
    for (let t = 0; t < teams.length; t++) {
      const pickNum = r * teams.length + (r % 2 === 0 ? t + 1 : teams.length - t)
      const pick = picks.find(p => p.pick_number === pickNum) || null
      row.push(pick)
    }
    draftBoard.push(row)
  }

  // Golfer picker component (shared between mobile and desktop)
  const golferPicker = (
    <div ref={pickerRef} className="bg-white rounded-sm border border-muted-gray/20">
      {/* Pick error */}
      {pickError && (
        <div className="p-3 bg-red-50 text-score-red text-sm border-b border-red-100">
          {pickError}
        </div>
      )}

      {/* Pending pick confirmation bar */}
      {pendingPick && (isMyTurn || isCommissioner) && (
        <div className="p-3 bg-cheddar/20 border-b-2 border-cheddar">
          <div className="text-sm font-serif font-semibold text-pimento mb-2">
            {pendingPick.golfer_name}
          </div>
          <div className="flex gap-2">
            <button
              disabled={picking}
              onClick={() => {
                makePick(pendingPick.golfer_id, pendingPick.golfer_name)
                setPendingPick(null)
              }}
              className="flex-1 bg-pimento text-white py-2 px-4 rounded-sm text-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {picking ? 'Confirming...' : 'Confirm Pick'}
            </button>
            <button
              disabled={picking}
              onClick={() => setPendingPick(null)}
              className="px-4 py-2 border border-muted-gray/30 text-muted-gray rounded-sm text-sm hover:bg-cream transition-colors min-h-[44px]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="p-3 border-b border-muted-gray/20">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search golfers..."
          className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-pimento focus:border-transparent"
        />
      </div>
      <div className="max-h-96 overflow-y-auto">
        {availableGolfers.map(g => {
          const isSelected = pendingPick?.golfer_id === g.golfer_id
          return (
            <button
              key={g.golfer_id}
              disabled={(!isMyTurn && !isCommissioner) || picking}
              onClick={() => setPendingPick({ golfer_id: g.golfer_id, golfer_name: g.golfer_name })}
              className={`w-full px-3 py-2 min-h-[44px] text-left text-sm flex items-center justify-between border-b border-muted-gray/10 transition-colors ${
                isSelected
                  ? 'bg-pimento/10 font-semibold'
                  : 'hover:bg-cream disabled:opacity-50 disabled:hover:bg-white'
              }`}
            >
              <span className="flex items-center gap-2">
                {isSelected && (
                  <span className="text-pimento text-xs">&#10003;</span>
                )}
                {g.golfer_name}
              </span>
              {g.world_ranking && (
                <span className="text-xs text-muted-gray">#{g.world_ranking}</span>
              )}
            </button>
          )
        })}
        {availableGolfers.length === 0 && (
          <div className="p-4 text-center text-muted-gray text-sm font-serif italic">
            {golfers.length === 0 ? EMPTY_STATE_COPY.draftBoardEmpty : 'No golfers match your search'}
          </div>
        )}
      </div>
    </div>
  )

  // Draft board component (shared between mobile and desktop)
  const draftBoardTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-pimento text-cream">
            <th className="px-2 py-2 text-left font-serif text-xs">Rd</th>
            {teams.map(t => (
              <th key={t.id} className={`px-2 py-2 text-left font-serif text-xs ${
                pickingTeam?.id === t.id ? 'text-cheddar font-bold' : ''
              }`}>
                {t.owner_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draftBoard.map((row, r) => (
            <tr key={r} className={`border-b border-muted-gray/20 ${r % 2 === 0 ? 'bg-white' : 'bg-cream'}`}>
              <td className="px-2 py-2 text-muted-gray font-serif">{r + 1}</td>
              {row.map((pick, t) => (
                <td key={t} className="px-2 py-2">
                  {pick ? (
                    <span className="text-xs font-medium">{pick.golfer_name}</span>
                  ) : (
                    <span className="text-muted-gray/40">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <GreenJacketIcon size={24} />
            <h1 className="text-2xl font-serif font-bold text-pimento">Draft</h1>
          </div>
          <div className="text-sm text-muted-gray">
            Pick {Math.min(draftState.current_pick, draftState.total_picks)} of {draftState.total_picks}
          </div>
        </div>

        {/* Milestone: draft starting */}
        {picks.length === 0 && !isComplete && (
          <MilestoneBanner text={MILESTONE_COPY.draftStarting} />
        )}

        {/* Current pick banner */}
        {!isComplete && pickingTeam && (
          <div className={`rounded-sm p-4 mb-4 ${
            isManualMode || isMyTurn ? 'bg-pimento text-white' : 'bg-white border border-muted-gray/20'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-75">
                  {isManualMode
                    ? `Picking for ${pickingTeam.owner_name}`
                    : timeLeft === 0 && timeLeft !== null
                      ? `Time's up! Auto-picking for ${pickingTeam.owner_name}...`
                      : isMyTurn ? MILESTONE_COPY.yourTurn : `${pickingTeam.owner_name} is picking...`}
                </div>
                <div className="text-lg font-serif font-bold">
                  Round {currentPickInfo?.round}
                </div>
              </div>
              {/* Timer: only show for live mode with a time limit */}
              {!isManualMode && !isUnlimitedTimer && timeLeft !== null && (
                <div className={`text-3xl font-mono font-bold ${timeLeft <= 10 ? (isMyTurn ? 'text-cheddar' : 'text-score-red') : ''}`}>
                  {timeLeft === 0 ? '0:00' : `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
                </div>
              )}
              {!isManualMode && isUnlimitedTimer && (
                <div className="text-sm opacity-75 font-serif italic">No time limit</div>
              )}
            </div>
            {/* Auto-pick button: only for live mode with timer that expired */}
            {!isManualMode && !isUnlimitedTimer && timeLeft === 0 && isCommissioner && !autoPickTriggered && (
              <div className="mt-2">
                <button
                  onClick={autoPickBestAvailable}
                  className="bg-cheddar text-pimento-dark px-4 py-2 rounded-sm text-sm font-semibold min-h-[44px]"
                >
                  Auto-pick best available
                </button>
              </div>
            )}
          </div>
        )}

        {isComplete && (
          <div className="bg-pimento text-white rounded-sm p-4 mb-4 text-center">
            <MilestoneBanner text={MILESTONE_COPY.draftComplete} />
            {isManualMode && isCommissioner ? (
              <button
                onClick={finalizeDraft}
                disabled={picking}
                className="mt-3 bg-cheddar text-pimento-dark px-6 py-3 rounded-sm font-semibold hover:bg-cheddar/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {picking ? 'Finalizing...' : 'Finalize Draft'}
              </button>
            ) : (
              <p className="text-sm opacity-75 mt-1">Redirecting to leaderboard...</p>
            )}
          </div>
        )}

        {/* Mobile Layout: picker first when it's your turn, board first when watching */}
        <div className="sm:hidden space-y-4">
          {shouldShowPickerFirst ? (
            <>
              {golferPicker}
              {draftBoardTable}
            </>
          ) : (
            <>
              {draftBoardTable}
              {golferPicker}
            </>
          )}
        </div>

        {/* Desktop Layout: side by side */}
        <div className="hidden sm:grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {draftBoardTable}
          </div>
          {golferPicker}
        </div>
      </div>
    </main>
  )
}
