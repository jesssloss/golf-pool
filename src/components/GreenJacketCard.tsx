import Image from 'next/image'

interface Props {
  winnerName: string
  poolName: string
  winningScore: string
  year?: string
}

export default function GreenJacketCard({ winnerName, poolName, winningScore, year = '2026' }: Props) {
  return (
    <div className="mx-auto max-w-xs rounded-lg bg-pimento-dark border-2 border-cheddar p-8 text-center" style={{ aspectRatio: '2/3' }}>
      <div className="font-serif text-cheddar text-xs uppercase tracking-[0.25em] mb-4">Champion</div>
      <div className="flex justify-center mb-4">
        <Image src="/pimento.png" alt="Pimento" width={64} height={64} />
      </div>
      <div className="font-serif text-cheddar text-3xl font-bold mb-2">{winnerName}</div>
      <div className="font-serif text-cheddar/70 text-lg mb-6">{winningScore}</div>
      <div className="w-16 mx-auto border-t border-cheddar/40 mb-6" />
      <div className="font-serif text-cheddar/50 text-sm">{poolName}</div>
      <div className="font-serif text-cheddar/40 text-sm">{year}</div>
    </div>
  )
}
