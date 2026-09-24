'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const deep2 = '#2A6349', gold = '#D87E13'

export default function SeminarBanner() {
  const [title, setTitle] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('parent_seminars').select('title').eq('is_active', true).eq('banner_enabled', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        if (!cancelled) setTitle(data?.title ?? null)
      })
    return () => { cancelled = true }
  }, [])

  if (!title) return null

  return (
    <a href="#lpv-seminar" className="lpv-smb">
      <style>{`
        .lpv-smb{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;
          gap:10px;background:${deep2};color:#fff;padding:10px 20px;text-decoration:none;font-size:13px;white-space:nowrap}
        .lpv-smb:hover .lpv-smb-arrow{transform:translateX(3px)}
        .lpv-smb-lead{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:${gold};flex-shrink:0}
        .lpv-smb-dot{width:6px;height:6px;border-radius:50%;background:${gold};flex-shrink:0}
        .lpv-smb-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .lpv-smb-arrow{font-weight:700;transition:transform .15s ease;flex-shrink:0}
        @media (max-width:640px){
          .lpv-smb{padding:9px 14px;font-size:11px;gap:7px}
          .lpv-smb-lead{gap:4px}
        }
        @media (max-width:420px){
          .lpv-smb-arrow{display:none}
        }
      `}</style>
      <span className="lpv-smb-lead">
        <span className="lpv-smb-dot" />
        학부모 설명회 신청 안내
      </span>
      <span className="lpv-smb-title">{title}</span>
      <span className="lpv-smb-arrow">자세히 보기 →</span>
    </a>
  )
}
