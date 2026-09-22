'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const deep = '#154A32', gold = '#D87E13'

export default function SpecialClassBanner() {
  const [title, setTitle] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('special_classes').select('title').eq('is_active', true)
      .order('sort_order').limit(1).maybeSingle().then(({ data }) => {
        if (!cancelled) setTitle(data?.title ?? null)
      })
    return () => { cancelled = true }
  }, [])

  if (!title) return null

  return (
    <a href="#lpv-special" className="lpv-scb">
      <style>{`
        .lpv-scb{position:absolute;top:0;left:0;right:0;z-index:2;display:flex;align-items:center;justify-content:center;
          gap:10px;background:${deep};color:#fff;padding:13px 20px;text-decoration:none;font-size:13.5px;white-space:nowrap}
        .lpv-scb:hover .lpv-scb-arrow{transform:translateX(3px)}
        .lpv-scb-lead{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:${gold};flex-shrink:0}
        .lpv-scb-dot{width:6px;height:6px;border-radius:50%;background:${gold};flex-shrink:0}
        .lpv-scb-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .lpv-scb-arrow{font-weight:700;transition:transform .15s ease;flex-shrink:0}
        @media (max-width:640px){
          .lpv-scb{padding:10px 14px;font-size:11.5px;gap:7px}
          .lpv-scb-lead{gap:4px}
        }
        @media (max-width:420px){
          .lpv-scb-arrow{display:none}
        }
      `}</style>
      <span className="lpv-scb-lead">
        <span className="lpv-scb-dot" />
        지금 모집 중인 특강이 있어요
      </span>
      <span className="lpv-scb-title">{title}</span>
      <span className="lpv-scb-arrow">자세히 보기 →</span>
    </a>
  )
}
