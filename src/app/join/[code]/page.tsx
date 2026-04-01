'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import PatronBadge from '@/components/PatronBadge'

export default function JoinPool() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string
  const [name, setName] = useState('')
  const [poolName, setPoolName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch pool name for the badge
  useEffect(() => {
    async function fetchPool() {
      try {
        const res = await fetch(`/api/pools/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode: code, peek: true }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.pool_name) setPoolName(data.pool_name)
        }
      } catch {
        // silent fail, badge will just show code
      }
    }
    fetchPool()
  }, [code])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/pools/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/pool/${data.pool_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join pool')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Patron Badge */}
        <div className="mb-8">
          <PatronBadge
            poolName={poolName || `Pool ${code}`}
            playerName={name || undefined}
          />
        </div>

        {error && (
          <div className="bg-red-50 text-score-red p-3 rounded-sm mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-augusta focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-augusta text-white py-3 px-6 rounded-sm font-semibold hover:bg-augusta-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join Pool'}
          </button>
        </form>
      </div>
    </main>
  )
}
