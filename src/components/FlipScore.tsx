'use client'

import { useRef, useState, useEffect } from 'react'

interface Props {
  value: string
  className?: string
}

export default function FlipScore({ value, className = '' }: Props) {
  const prevValue = useRef(value)
  const [flipping, setFlipping] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      setDisplayValue(value)
      prevValue.current = value
      return
    }

    if (value !== prevValue.current) {
      setFlipping(true)
      const timer = setTimeout(() => {
        setDisplayValue(value)
        setFlipping(false)
        prevValue.current = value
      }, 450)
      return () => clearTimeout(timer)
    }
  }, [value])

  return (
    <span className={`flip-card inline-block ${className}`}>
      <span className={`flip-card-inner inline-block ${flipping ? 'flipping' : ''}`}>
        <span className="flip-card-front inline-block">{displayValue}</span>
        <span className="flip-card-back inline-block bg-cream-dark">{value}</span>
      </span>
    </span>
  )
}
