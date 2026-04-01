interface Props {
  size?: number
}

export default function GreenJacketIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 4C10.5 4 9.5 4.5 9 5L6 8L4 12V18C4 19 4.5 20 6 20H8L9 18H15L16 20H18C19.5 20 20 19 20 18V12L18 8L15 5C14.5 4.5 13.5 4 12 4Z"
        fill="#006747"
        stroke="#004D35"
        strokeWidth="0.5"
      />
      <path d="M10 8L12 6L14 8" stroke="#004D35" strokeWidth="0.5" fill="none" />
      <line x1="12" y1="6" x2="12" y2="14" stroke="#004D35" strokeWidth="0.3" />
    </svg>
  )
}
