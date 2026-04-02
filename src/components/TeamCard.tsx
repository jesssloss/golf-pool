interface Props {
  ownerName: string
  golfers: { name: string; pickOrder: number }[]
  poolName: string
  year?: string
}

export default function TeamCard({ ownerName, golfers, poolName, year = '2026' }: Props) {
  return (
    <div className="mx-auto max-w-xs rounded-lg bg-pimento border-2 border-cheddar p-6 text-center" style={{ aspectRatio: '2/3' }}>
      <div className="font-serif text-white text-2xl font-bold mb-4">{ownerName}</div>
      <div className="w-16 mx-auto border-t border-cheddar mb-4" />
      <div className="space-y-2 mb-6">
        {golfers.map((g, i) => (
          <div key={i} className="font-serif text-white text-sm">
            <span className="text-cheddar/70 mr-2">{g.pickOrder}.</span>
            {g.name}
          </div>
        ))}
      </div>
      <div className="font-serif text-cream/60 text-xs">
        {poolName} &middot; {year}
      </div>
    </div>
  )
}
