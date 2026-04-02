'use client'

import Image from 'next/image'

interface Props {
  poolName: string
  year?: string
  playerName?: string
}

export default function PatronBadge({ poolName, year = '2026', playerName }: Props) {
  return (
    <div className="mx-auto max-w-sm rounded-lg bg-pimento border-2 border-cheddar p-8 text-center">
      <div className="flex justify-center mb-3">
        <Image src="/pimento.png" alt="Pimento" width={40} height={40} />
      </div>
      <div className="font-serif text-cream text-2xl font-bold mb-1">{poolName}</div>
      <div className="font-serif text-cream/70 text-lg mb-4">{year}</div>
      <div className="font-serif italic text-cream/80 text-sm">You&apos;ve been invited.</div>
      {playerName && (
        <div className="mt-4 pt-4 border-t border-cheddar/40 milestone-fade">
          <div className="font-serif text-white text-xl font-bold">{playerName}</div>
        </div>
      )}
    </div>
  )
}
