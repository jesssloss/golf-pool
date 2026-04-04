'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, PayoutRule } from '@/types'
import Leaderboard from '@/components/Leaderboard'
import MilestoneBanner from '@/components/MilestoneBanner'
import { MILESTONE_COPY, EMPTY_STATE_COPY } from '@/lib/constants/copy'
import GreenJacketIcon from '@/components/GreenJacketIcon'

export default function PoolPage() {
  const params = useParams()
  const router = useRouter()
  const poolId = params.id as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [payoutRules, setPayoutRules] = useState<PayoutRule[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [addPlayerError, setAddPlayerError] = useState('')

  const loadData = useCallback(async () => {
    const [poolRes, teamsRes, rulesRes] = await Promise.all([
      supabase.from('pools').select('id, name, tournament_name, invite_code, status, players_per_team, scoring_players, missed_cut_score, drop_deadline_round, draft_timer_seconds, draft_mode, slug, buy_in_amount, payment_method, payment_details, created_at').eq('id', poolId).single(),
      supabase.from('teams').select('id, pool_id, owner_name, draft_position, is_commissioner, buy_in_paid, created_at').eq('pool_id', poolId).order('draft_position'),
      supabase.from('payout_rules').select('*').eq('pool_id', poolId).order('position'),
    ])

    if (poolRes.data) setPool(poolRes.data as Pool)
    if (teamsRes.data) setTeams(teamsRes.data as Team[])
    if (rulesRes.data) setPayoutRules(rulesRes.data)

    const res = await fetch(`/api/pools/${poolId}/me`)
    if (res.ok) {
      const data = await res.json()
      if (data.team) setCurrentTeam(data.team)
      setIsCommissioner(data.isCommissioner ?? false)
    }

    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('pool-lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `pool_id=eq.${poolId}` }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pools', filter: `id=eq.${poolId}` }, () => {
        loadData()
      })
      .subscribe()

    // Polling fallback in case Realtime isn't connected
    const pollInterval = setInterval(loadData, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [poolId, supabase, loadData])

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">Loading...</p>
      </main>
    )
  }

  if (!pool) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-score-red">Pool not found</div>
      </main>
    )
  }

  if (pool.status === 'active' || pool.status === 'complete') {
    return <Leaderboard poolId={poolId} pool={pool} />
  }

  if (pool.status === 'drafting') {
    router.push(`/pool/${poolId}/draft`)
    return null
  }

  // Lobby view
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${pool.invite_code}`
    : ''

  const publicUrl = pool.slug
    ? (typeof window !== 'undefined' ? `${window.location.origin}/p/${pool.slug}` : `pimento.bet/${pool.slug}`)
    : ''

  const isManualMode = pool.draft_mode === 'manual'

  async function randomizeDraftOrder() {
    const res = await fetch(`/api/pools/${poolId}/draft-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'randomize' }),
    })
    if (res.ok) loadData()
  }

  async function startDraft() {
    const res = await fetch(`/api/pools/${poolId}/draft/start`, { method: 'POST' })
    if (res.ok) router.push(`/pool/${poolId}/draft`)
  }

  async function enterPicks() {
    const res = await fetch(`/api/pools/${poolId}/draft/start`, { method: 'POST' })
    if (res.ok) router.push(`/pool/${poolId}/draft`)
  }

  async function togglePaid(teamId: string, currentPaid: boolean) {
    await fetch(`/api/pools/${poolId}/teams/${teamId}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !currentPaid }),
    })
    loadData()
  }

  async function addPlayer() {
    if (!newPlayerName.trim()) return
    setAddingPlayer(true)
    setAddPlayerError('')
    try {
      const res = await fetch(`/api/pools/${poolId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: newPlayerName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAddPlayerError(data.error || 'Failed to add player')
      } else {
        setNewPlayerName('')
        loadData()
      }
    } catch {
      setAddPlayerError('Failed to add player. Check your connection.')
    }
    setAddingPlayer(false)
  }

  async function removePlayer(teamId: string) {
    try {
      const res = await fetch(`/api/pools/${poolId}/teams`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      if (res.ok) loadData()
    } catch {
      // silently fail
    }
  }

  const paidCount = teams.filter(t => t.buy_in_paid).length
  const totalExpected = pool.buy_in_amount * teams.length
  const totalCollected = pool.buy_in_amount * paidCount

  function paymentMethodLabel(method: string) {
    switch (method) {
      case 'e-transfer': return 'Interac e-Transfer'
      case 'paypal': return 'PayPal'
      case 'cash': return 'Cash'
      default: return 'Other'
    }
  }

  // Shared pool config card
  const poolConfigCard = (
    <div className="bg-white rounded-sm p-4 mb-6 border border-muted-gray/20">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-serif font-bold text-pimento">${pool.buy_in_amount}</div>
          <div className="text-xs text-muted-gray">Buy-in</div>
        </div>
        <div>
          <div className="text-2xl font-serif font-bold text-pimento">{pool.players_per_team}</div>
          <div className="text-xs text-muted-gray">Golfers/Team</div>
        </div>
        <div>
          <div className="text-2xl font-serif font-bold text-pimento">{pool.scoring_players}</div>
          <div className="text-xs text-muted-gray">Count Best</div>
        </div>
        <div>
          <div className="text-2xl font-serif font-bold text-pimento">
            {pool.draft_mode === 'manual' ? 'Manual' : pool.draft_timer_seconds === 0 ? 'None' : `${pool.draft_timer_seconds}s`}
          </div>
          <div className="text-xs text-muted-gray">
            {pool.draft_mode === 'manual' ? 'Draft Mode' : 'Draft Timer'}
          </div>
        </div>
      </div>
      {payoutRules.length > 0 && (
        <div className="mt-4 pt-4 border-t border-muted-gray/20">
          <div className="text-xs text-muted-gray mb-2">Payouts</div>
          <div className="flex gap-4">
            {payoutRules.map(r => (
              <div key={r.position} className="text-sm">
                <span className="text-muted-gray">#{r.position}:</span>{' '}
                <span className="font-semibold">{r.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── Commissioner Lobby ──
  if (isCommissioner) {
    return (
      <main className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-2 flex items-center gap-3">
            <GreenJacketIcon size={28} />
            <div>
              <h1 className="text-3xl font-serif font-bold text-pimento">{pool.name}</h1>
              <p className="text-muted-gray mt-1">{pool.tournament_name}</p>
            </div>
          </div>

          <MilestoneBanner text={MILESTONE_COPY.poolCreated} />

          {/* Manual mode: show public URL */}
          {isManualMode && publicUrl ? (
            <div className="bg-white rounded-sm p-4 mb-6 border border-muted-gray/20 mt-4">
              <div className="text-sm text-muted-gray mb-1">Player tracking link</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-cream px-3 py-2 rounded-sm text-sm font-mono break-all">
                  {publicUrl}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(publicUrl)}
                  className="px-3 py-2 min-h-[44px] bg-pimento text-white text-sm rounded-sm hover:bg-pimento-dark transition-colors whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-muted-gray mt-2">
                Share this link with players. The leaderboard will go live once you finalize the draft.
              </p>
            </div>
          ) : !isManualMode ? (
            /* Live mode: show invite link */
            <div className="bg-white rounded-sm p-4 mb-6 border border-muted-gray/20 mt-4">
              <div className="text-sm text-muted-gray mb-1">Share this link to invite players</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-cream px-3 py-2 rounded-sm text-sm font-mono break-all">
                  {inviteUrl}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(inviteUrl)}
                  className="px-3 py-2 min-h-[44px] bg-pimento text-white text-sm rounded-sm hover:bg-pimento-dark transition-colors whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : null}

          {poolConfigCard}

          {/* Players list */}
          <div className="bg-white rounded-sm border border-muted-gray/20 overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-muted-gray/20 bg-cream flex items-center justify-between">
              <h2 className="font-serif font-semibold text-gray-700">
                Players ({teams.length})
              </h2>
              <div className="text-xs text-muted-gray">
                <span className={paidCount === teams.length && teams.length > 0 ? 'text-score-green font-semibold' : ''}>
                  ${totalCollected}
                </span>
                {' / $'}{totalExpected} collected
              </div>
            </div>

            {/* Add Player input - manual mode only */}
            {isManualMode && (
              <div className="px-4 py-3 border-b border-muted-gray/20">
                {addPlayerError && (
                  <div className="text-score-red text-xs mb-2">{addPlayerError}</div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={e => setNewPlayerName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlayer() } }}
                    placeholder="Enter player name..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-pimento focus:border-transparent"
                  />
                  <button
                    onClick={addPlayer}
                    disabled={addingPlayer || !newPlayerName.trim()}
                    className="px-4 py-2 min-h-[44px] bg-pimento text-white text-sm rounded-sm hover:bg-pimento-dark transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {addingPlayer ? 'Adding...' : 'Add Player'}
                  </button>
                </div>
              </div>
            )}

            {teams.length === 0 && (
              <div className="px-4 py-8 text-center">
                <GreenJacketIcon size={24} />
                <p className="font-serif italic text-muted-gray mt-2">{EMPTY_STATE_COPY.preDraftNoPlayers}</p>
              </div>
            )}
            <div className="divide-y divide-muted-gray/20">
              {teams.map((team, i) => (
                <div key={team.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-gray w-6 font-serif">{team.draft_position || i + 1}</span>
                    <span className="font-medium">
                      {team.owner_name}
                      {team.is_commissioner && (
                        <span className="ml-2 text-xs bg-pimento text-white px-2 py-0.5 rounded-sm">
                          Commissioner
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePaid(team.id, team.buy_in_paid)}
                      className={`text-xs px-3 py-2 min-h-[44px] rounded-sm ${
                        team.buy_in_paid
                          ? 'bg-score-green/10 text-score-green'
                          : 'bg-gray-100 text-muted-gray'
                      }`}
                    >
                      {team.buy_in_paid ? 'Paid' : 'Unpaid'}
                    </button>
                    {isManualMode && (
                      <button
                        onClick={() => removePlayer(team.id)}
                        className="text-score-red text-sm hover:text-red-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Remove player"
                      >
                        &#10005;
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commissioner controls */}
          <div className="space-y-3">
            {!isManualMode && (
              <button
                onClick={randomizeDraftOrder}
                className="w-full py-3 px-6 border-2 border-pimento text-pimento rounded-sm font-semibold hover:bg-pimento hover:text-white transition-colors"
              >
                Randomize Draft Order
              </button>
            )}
            {isManualMode ? (
              <button
                onClick={enterPicks}
                disabled={teams.length < 2}
                className="w-full py-3 px-6 bg-pimento text-white rounded-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50"
              >
                Enter Picks
              </button>
            ) : (
              <button
                onClick={startDraft}
                disabled={teams.length < 2}
                className="w-full py-3 px-6 bg-pimento text-white rounded-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50"
              >
                Start Draft
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ── Participant Lobby ──
  const myDraftPosition = currentTeam?.draft_position
  const allHavePositions = teams.every(t => t.draft_position !== null)

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-2 flex items-center gap-3">
          <GreenJacketIcon size={28} />
          <div>
            <h1 className="text-3xl font-serif font-bold text-pimento">{pool.name}</h1>
            <p className="text-muted-gray mt-1">{pool.tournament_name}</p>
          </div>
        </div>

        {/* Participant status card */}
        {currentTeam ? (
          <div className="bg-white rounded-sm p-4 mb-6 border border-pimento/30 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-gray">You&apos;re in</div>
                <div className="font-serif font-semibold text-lg">{currentTeam.owner_name}</div>
              </div>
              {myDraftPosition && allHavePositions ? (
                <div className="text-right">
                  <div className="text-sm text-muted-gray">Draft Position</div>
                  <div className="text-3xl font-serif font-bold text-pimento">#{myDraftPosition}</div>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-xs text-muted-gray italic">Draft order not set yet</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-sm p-4 mb-6 border border-muted-gray/20 mt-4 text-center">
            <p className="font-serif italic text-muted-gray">You&apos;re viewing this pool as a spectator</p>
          </div>
        )}

        {/* Payment instructions */}
        {currentTeam && !currentTeam.buy_in_paid && pool.buy_in_amount > 0 && (
          <div className="bg-cheddar/10 rounded-sm p-4 mb-6 border border-cheddar/30">
            <div className="flex items-center justify-between mb-2">
              <div className="font-serif font-semibold text-sm">Buy-in: ${pool.buy_in_amount}</div>
              <span className="text-xs px-2 py-1 rounded-sm bg-cheddar/20 text-cheddar font-medium">
                Payment Pending
              </span>
            </div>
            <div className="text-sm text-gray-700">
              {pool.payment_method === 'paypal' && pool.payment_details ? (
                <>
                  Send via{' '}
                  <a
                    href={`https://paypal.me/${pool.payment_details.replace(/^(https?:\/\/)?(paypal\.me\/)?/, '')}/${pool.buy_in_amount}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pimento underline font-medium"
                  >
                    PayPal
                  </a>
                </>
              ) : (
                <>
                  <span className="text-muted-gray">Send via</span>{' '}
                  <span className="font-medium">{paymentMethodLabel(pool.payment_method)}</span>
                  {pool.payment_details && (
                    <>
                      <span className="text-muted-gray"> to </span>
                      <span className="font-medium">{pool.payment_details}</span>
                    </>
                  )}
                </>
              )}
            </div>
            {pool.payment_method === 'e-transfer' && pool.payment_details && (
              <div className="mt-2 text-xs text-muted-gray">
                Memo: {pool.name} - {currentTeam.owner_name}
              </div>
            )}
          </div>
        )}
        {currentTeam && currentTeam.buy_in_paid && (
          <div className="bg-score-green/10 rounded-sm p-3 mb-6 border border-score-green/30 flex items-center justify-between">
            <span className="text-sm font-medium text-score-green">Buy-in paid</span>
            <span className="text-sm font-serif">${pool.buy_in_amount}</span>
          </div>
        )}

        {poolConfigCard}

        {/* Player roster -- read-only */}
        <div className="bg-white rounded-sm border border-muted-gray/20 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-muted-gray/20 bg-cream">
            <h2 className="font-serif font-semibold text-gray-700">
              Players ({teams.length})
            </h2>
          </div>
          {teams.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="font-serif italic text-muted-gray">{EMPTY_STATE_COPY.preDraftNoPlayers}</p>
            </div>
          )}
          <div className="divide-y divide-muted-gray/20">
            {teams.map((team, i) => {
              const isMe = currentTeam?.id === team.id
              return (
                <div key={team.id} className={`px-4 py-3 flex items-center justify-between ${isMe ? 'bg-pimento/5' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-gray w-6 font-serif">{team.draft_position || i + 1}</span>
                    <span className={`font-medium ${isMe ? 'text-pimento' : ''}`}>
                      {team.owner_name}
                      {isMe && (
                        <span className="ml-2 text-xs text-pimento/60">(you)</span>
                      )}
                      {team.is_commissioner && (
                        <span className="ml-2 text-xs bg-pimento text-white px-2 py-0.5 rounded-sm">
                          Commissioner
                        </span>
                      )}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-sm ${
                    team.buy_in_paid ? 'text-score-green' : 'text-muted-gray'
                  }`}>
                    {team.buy_in_paid ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Waiting state */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-cream rounded-sm border border-muted-gray/20">
            <span className="inline-block w-2 h-2 bg-cheddar rounded-full animate-pulse" />
            <span className="font-serif italic text-muted-gray text-sm">
              Waiting for the commissioner to start the draft...
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
