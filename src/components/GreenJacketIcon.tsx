import Image from 'next/image'

interface Props {
  size?: number
}

export default function GreenJacketIcon({ size = 20 }: Props) {
  return (
    <Image
      src="/pimento.png"
      alt="Pimento"
      width={size}
      height={size}
      className="inline-block"
    />
  )
}
