'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pool } from '@/types'
import Leaderboard from '@/components/Leaderboard'
import GreenJacketIcon from '@/components/GreenJacketIcon'

export default function PublicPoolPage() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function loadPool() {
      const { data, error } = await supabase
        .from('pools')
        .select('id, name, tournament_name, invite_code, status, players_per_team, scoring_players, missed_cut_score, drop_deadline_round, draft_timer_seconds, draft_mode, slug, buy_in_amount, payment_method, payment_details, created_at')
        .eq('slug', slug)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        setPool(data as Pool)
      }
      setLoading(false)
    }
    loadPool()
  }, [slug, supabase])

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">Loading...</p>
      </main>
    )
  }

  if (notFound || !pool) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <GreenJacketIcon size={32} />
        <h1 className="text-2xl font-serif font-bold text-pimento mt-4">Pool Not Found</h1>
        <p className="text-muted-gray mt-2 text-center">
          This pool doesn&apos;t exist or the link may be incorrect.
        </p>
      </main>
    )
  }

  if (pool.status === 'lobby' || pool.status === 'drafting') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <GreenJacketIcon size={32} />
        <h1 className="text-2xl font-serif font-bold text-pimento mt-4">{pool.name}</h1>
        <p className="text-muted-gray mt-2 text-center">
          This pool is being set up. Check back soon.
        </p>
      </main>
    )
  }

  // Active or complete pool: show read-only leaderboard
  return <Leaderboard poolId={pool.id} pool={pool} readOnly={true} />
}
