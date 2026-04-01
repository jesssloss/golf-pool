interface Props {
  status: 'cut' | 'withdrawn' | 'dq' | 'dropped'
}

const LABELS: Record<string, string> = {
  cut: 'MC',
  withdrawn: 'WD',
  dq: 'DQ',
  dropped: 'DROPPED',
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className="inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide bg-gray-200 text-gray-500 rounded-sm">
      {LABELS[status] || status.toUpperCase()}
    </span>
  )
}
