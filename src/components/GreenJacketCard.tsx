interface Props {
  winnerName: string
  poolName: string
  winningScore: string
  year?: string
}

export default function GreenJacketCard({ winnerName, poolName, winningScore, year = '2026' }: Props) {
  return (
    <div className="mx-auto max-w-xs rounded-lg bg-augusta-dark border-2 border-masters-gold p-8 text-center" style={{ aspectRatio: '2/3' }}>
      <div className="font-serif text-masters-gold text-xs uppercase tracking-[0.25em] mb-6">Champion</div>
      <div className="font-serif text-masters-gold text-3xl font-bold mb-2">{winnerName}</div>
      <div className="font-serif text-masters-gold/70 text-lg mb-6">{winningScore}</div>
      <div className="w-16 mx-auto border-t border-masters-gold/40 mb-6" />
      <div className="font-serif text-masters-gold/50 text-sm">{poolName}</div>
      <div className="font-serif text-masters-gold/40 text-sm">{year}</div>
    </div>
  )
}
