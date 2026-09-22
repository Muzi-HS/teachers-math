'use client'
import { useEffect, useRef, useState } from 'react'

// 대안 시안 전용 스크롤 등장 헬퍼. 새 라이브러리 없이 IntersectionObserver만 사용한다.
export default function Reveal({ children, delay = 0, as: Tag = 'div' }: {
  children: React.ReactNode; delay?: number; as?: keyof React.JSX.IntrinsicElements
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { const t = setTimeout(() => setShown(true), 0); return () => clearTimeout(t) }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const Wrapper = Tag as 'div'
  return (
    <Wrapper ref={ref} className="lpv-reveal" data-shown={shown} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Wrapper>
  )
}
