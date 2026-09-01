'use client'
import { TextareaHTMLAttributes, useEffect, useLayoutEffect, useRef } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minHeight?: number }

// SSR 환경(document 없음)에서 useLayoutEffect 경고를 피하기 위한 가드
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// 입력한 내용에 맞춰 높이가 자동으로 늘어나는 textarea (수동 리사이즈 대체)
export default function AutoGrowTextarea({ minHeight = 0, style, value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, minHeight) + 'px'
  }, [value, minHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...rest}
    />
  )
}
