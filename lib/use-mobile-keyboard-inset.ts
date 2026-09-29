'use client'

import { useEffect, useState } from 'react'

export function useMobileKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active || !window.visualViewport) return
    const viewport = window.visualViewport
    const update = () => setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    const frame = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [active])

  return active ? inset : 0
}
