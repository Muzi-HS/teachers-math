'use client'
import { useEffect, useState } from 'react'
import type { Season, SeasonIntensity } from '@/lib/season'
import SeasonCanvas from './SeasonCanvas'

// 히어로 위에 얹는 계절 파티클 효과의 진입점. enabled/season/intensity는 부모(홈페이지,
// 관리자 미리보기 등)가 사이트 설정에서 읽어와 그대로 넘겨주면 된다 — 여기서는
// prefers-reduced-motion만 자체적으로 확인해서, 사용자가 모션을 줄이도록 설정해뒀으면
// 효과를 아예 렌더링하지 않는다.
export default function SeasonEffect({
  enabled, season, intensity,
}: {
  enabled: boolean
  season: Season
  intensity: SeasonIntensity
}) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (!enabled || season === 'none' || reducedMotion) return null

  return <SeasonCanvas season={season} intensity={intensity} />
}
