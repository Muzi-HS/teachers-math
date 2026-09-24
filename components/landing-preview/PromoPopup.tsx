'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PopupType } from '@/lib/site-settings'

const deep = '#154A32', deep2 = '#2A6349', bd = 'rgba(21,74,50,.18)'

type PopupData = {
  key: string
  type: PopupType
  imageUrl: string | null
  title: string | null
  body: string | null
  linkHref: string
}

function dismissedToday(key: string): boolean {
  try {
    return localStorage.getItem(`promo-popup-hide:${key}`) === new Date().toDateString()
  } catch { return false }
}
function dismissToday(key: string) {
  try { localStorage.setItem(`promo-popup-hide:${key}`, new Date().toDateString()) } catch {}
}

export default function PromoPopup() {
  const [queue, setQueue] = useState<PopupData[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      // 특강 팝업과 설명회 팝업을 둘 다 모을 수 있게 큐로 쌓고, 하나씩 순서대로 보여준다
      // (동시에 겹쳐 띄우면 뒤 팝업이 가려지므로 순차 노출한다). 설명회를 먼저 보여준다.
      const list: PopupData[] = []

      const { data: seminar } = await supabase.from('parent_seminars')
        .select('id, popup_type, popup_image_url, popup_title, popup_body')
        .eq('is_active', true).eq('popup_enabled', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (seminar && !dismissedToday(`seminar:${seminar.id}`)) {
        list.push({
          key: `seminar:${seminar.id}`, type: seminar.popup_type, imageUrl: seminar.popup_image_url,
          title: seminar.popup_title, body: seminar.popup_body, linkHref: '#lpv-seminar',
        })
      }

      const { data: specialClass } = await supabase.from('special_classes')
        .select('id, popup_type, popup_image_url, popup_title, popup_body')
        .eq('is_active', true).eq('popup_enabled', true)
        .order('sort_order').limit(1).maybeSingle()
      if (specialClass && !dismissedToday(`special-class:${specialClass.id}`)) {
        list.push({
          key: `special-class:${specialClass.id}`, type: specialClass.popup_type, imageUrl: specialClass.popup_image_url,
          title: specialClass.popup_title, body: specialClass.popup_body, linkHref: '#lpv-special',
        })
      }

      if (!cancelled) setQueue(list)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const popup = queue[0]
  if (!popup) return null

  function dismiss() { setQueue(q => q.slice(1)) }
  function dismissForToday() { dismissToday(popup.key); dismiss() }

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(21,32,26,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={dismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: 380, maxWidth: '100%', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {(popup.type === 'image' || popup.type === 'both') && popup.imageUrl && (
          <a href={popup.linkHref} onClick={dismiss}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL이라 도메인이 프로젝트마다 달라 next/image remotePatterns에 고정할 수 없다 */}
            <img src={popup.imageUrl} alt={popup.title ?? ''} style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', background: '#EAF7F0' }} />
          </a>
        )}
        {(popup.type === 'text' || popup.type === 'both') && (popup.title || popup.body) && (
          <div style={{ padding: '22px 24px' }}>
            {popup.title && <p style={{ fontSize: 17, fontWeight: 800, color: deep, marginBottom: 10 }}>{popup.title}</p>}
            {popup.body && <p style={{ fontSize: 13.5, color: deep2, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{popup.body}</p>}
            <a href={popup.linkHref} onClick={dismiss} style={{ display: 'inline-block', marginTop: 14, fontSize: 13, fontWeight: 700, color: deep, textDecoration: 'underline' }}>
              자세히 보기 →
            </a>
          </div>
        )}
        <div style={{ display: 'flex', borderTop: `1px solid ${bd}` }}>
          <button onClick={dismissForToday} style={{ flex: 1, padding: '12px', border: 'none', background: 'none', fontSize: 12.5, color: deep2, cursor: 'pointer', fontFamily: 'inherit' }}>
            오늘 하루 보지 않기
          </button>
          <button onClick={dismiss} style={{ flex: 1, padding: '12px', border: 'none', borderLeft: `1px solid ${bd}`, background: 'none', fontSize: 12.5, fontWeight: 700, color: deep, cursor: 'pointer', fontFamily: 'inherit' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
