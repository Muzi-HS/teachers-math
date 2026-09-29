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

export function useMobileVisualViewport(active: boolean) {
  const [viewport, setViewport] = useState({ top: 0, height: 0 })

  useEffect(() => {
    if (!active) return
    const visualViewport = window.visualViewport
    const update = () => setViewport({
      top: visualViewport?.offsetTop ?? 0,
      height: visualViewport?.height ?? window.innerHeight,
    })
    const frame = requestAnimationFrame(update)
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [active])

  return viewport
}
