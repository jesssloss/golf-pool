import GreenJacketIcon from './GreenJacketIcon'

interface Props {
  position: number
  ownerName: string
  poolName: string
  prizeAmount: number
  score: string
}

export default function VictoryCard({ position, ownerName, poolName, prizeAmount, score }: Props) {
  const ordinal = position === 1 ? '1st' : position === 2 ? '2nd' : position === 3 ? '3rd' : `${position}th`

  return (
    <div className="bg-augusta-dark rounded-sm border border-masters-gold/40 p-6 text-center">
      {position === 1 && (
        <div className="mb-3 flex justify-center">
          <GreenJacketIcon size={32} />
        </div>
      )}
      <div className="text-masters-gold/60 text-xs uppercase tracking-[0.2em] font-serif mb-1">
        {position === 1 ? 'Champion' : `${ordinal} Place`}
      </div>
      <div className="text-masters-gold text-2xl font-serif font-bold mb-1">{ownerName}</div>
      <div className="text-masters-gold/70 font-mono mb-3">{score}</div>
      <div className="border-t border-masters-gold/20 pt-3">
        <div className="text-masters-gold text-xl font-bold">${prizeAmount}</div>
        <div className="text-masters-gold/40 text-xs font-serif mt-1">{poolName}</div>
      </div>
    </div>
  )
}
