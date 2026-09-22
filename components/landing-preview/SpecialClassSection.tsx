'use client'
import { useEffect, useState } from 'react'
import Reveal from './Reveal'
import { supabase } from '@/lib/supabase'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.14)'

type SpecialClass = {
  id: number
  title: string
  subtitle: string | null
  description: string | null
  period: string | null
  target: string | null
  capacity: string | null
}

export default function SpecialClassSection() {
  const [items, setItems] = useState<SpecialClass[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('special_classes').select('id,title,subtitle,description,period,target,capacity')
      .eq('is_active', true).order('sort_order').then(({ data }) => {
        if (!cancelled) setItems((data ?? []) as SpecialClass[])
      })
    return () => { cancelled = true }
  }, [])

  // 노출 중인 특강이 없으면(로딩 전 포함) 섹션 전체를 렌더링하지 않는다.
  if (items !== null && items.length === 0) return null

  return (
    <section id="lpv-special" style={{ background: '#EAF7F0', padding: '120px 20px' }}>
      <style>{`
        .lpv-sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;max-width:920px;margin:0 auto}
        .lpv-sc-card{background:#fff;border:1px solid ${line};border-radius:16px;padding:28px 26px;text-align:left}
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', marginBottom: 56 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            SPECIAL CLASS
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>
            지금 모집 중인<br />특강을 확인해보세요.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>
            재원생이 아니어도 신청하실 수 있는 기간 한정 특강입니다.
          </p>
        </Reveal>
      </div>

      {items === null ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: deep2 }}>불러오는 중...</p>
      ) : (
        <Reveal delay={250}>
          <div className="lpv-sc-grid">
            {items.map(it => (
              <div key={it.id} className="lpv-sc-card">
                <p style={{ fontSize: 16.5, fontWeight: 800, color: deep, marginBottom: it.subtitle ? 4 : 14 }}>{it.title}</p>
                {it.subtitle && <p style={{ fontSize: 13, color: deep2, marginBottom: 14 }}>{it.subtitle}</p>}
                {(it.period || it.target || it.capacity) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: it.description ? 14 : 0 }}>
                    {it.period && <p style={{ fontSize: 12.5, color: deep2 }}><span style={{ color: gold, fontWeight: 700 }}>기간</span> &nbsp;{it.period}</p>}
                    {it.target && <p style={{ fontSize: 12.5, color: deep2 }}><span style={{ color: gold, fontWeight: 700 }}>대상</span> &nbsp;{it.target}</p>}
                    {it.capacity && <p style={{ fontSize: 12.5, color: deep2 }}><span style={{ color: gold, fontWeight: 700 }}>정원</span> &nbsp;{it.capacity}</p>}
                  </div>
                )}
                {it.description && (
                  <p style={{ fontSize: 13, color: deep2, lineHeight: 1.8, wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}>{it.description}</p>
                )}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <a href="#lpv-consult" style={{
              display: 'inline-block', padding: '12px 26px', borderRadius: 999, background: deep, color: '#fff',
              fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
            }}>
              특강 상담 신청하기
            </a>
          </div>
        </Reveal>
      )}
    </section>
  )
}
