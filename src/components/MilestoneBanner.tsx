interface Props {
  text: string
}

export default function MilestoneBanner({ text }: Props) {
  return (
    <p className="milestone-fade text-center font-serif italic text-muted-gray text-sm py-2">
      {text}
    </p>
  )
}
