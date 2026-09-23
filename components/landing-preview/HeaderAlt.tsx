'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13'

const NAV = [
  { id: 'lpv-about', label: '학원소개' },
  { id: 'lpv-teaching', label: '수업방식' },
  { id: 'lpv-management', label: '학생관리' },
  { id: 'lpv-consult', label: '상담' },
  { id: 'lpv-location', label: '오시는길' },
]

export default function HeaderAlt({ onLoginClick }: { onLoginClick: () => void }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function goTo(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <header className="lpv-header" data-scrolled={scrolled}>
      <style>{`
        .lpv-header{position:sticky;top:0;z-index:80;display:flex;align-items:center;justify-content:space-between;
          gap:16px;padding:16px 28px;flex-wrap:wrap;row-gap:8px;
          background:rgba(234,247,240,.55);backdrop-filter:blur(10px);
          border-bottom:1px solid transparent;transition:background .25s ease,border-color .25s ease,padding .25s ease}
        .lpv-header[data-scrolled="true"]{background:rgba(251,250,246,.88);border-bottom-color:rgba(21,74,50,.1);padding:11px 28px}
        .lpv-header-brand{background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;flex-shrink:0}
        .lpv-header-brand:focus-visible{outline:2px solid ${gold};outline-offset:3px}
        .lpv-header-brand img{height:22px;width:auto;transition:height .25s ease;display:block}
        .lpv-header[data-scrolled="true"] .lpv-header-brand img{height:19px}
        .lpv-header-nav{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
          display:flex;gap:26px;list-style:none;margin:0;padding:0;white-space:nowrap}
        .lpv-header-nav button{background:none;border:none;cursor:pointer;font-family:inherit;padding:4px 0;
          font-size:13.5px;font-weight:600;color:${deep2};position:relative}
        .lpv-header-nav button::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:1.5px;background:${gold};
          transform:scaleX(0);transform-origin:left;transition:transform .2s ease}
        .lpv-header-nav button:hover::after,.lpv-header-nav button:focus-visible::after{transform:scaleX(1)}
        .lpv-header-nav button:focus-visible{outline:2px solid ${gold};outline-offset:3px}
        .lpv-header-login{padding:9px 20px;border-radius:999px;border:1.5px solid ${deep};background:transparent;
          color:${deep};font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s,color .15s;
          display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
        .lpv-header-login:hover{background:${deep};color:#fff}
        .lpv-header-login:focus-visible{outline:2px solid ${gold};outline-offset:3px}
        @media (max-width:980px) and (min-width:761px){
          .lpv-header-nav{gap:15px}
          .lpv-header-nav button{font-size:12.5px}
        }
        @media (max-width:760px){
          .lpv-header{padding:12px 18px;row-gap:10px}
          .lpv-header[data-scrolled="true"]{padding:10px 18px}
          .lpv-header-nav{position:static;transform:none;order:3;width:100%;gap:10px 16px;flex-wrap:wrap;white-space:normal;justify-content:center}
          .lpv-header-login{padding:8px 16px;font-size:12.5px}
        }
        @media (max-width:420px){
          .lpv-header-brand img{height:18px}
          .lpv-header-nav{gap:8px 12px}
          .lpv-header-nav button{font-size:12px}
        }
      `}</style>

      <button className="lpv-header-brand" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} aria-label="맨 위로">
        <Image src="/logo2.png" alt="티처스 수학학원" width={195} height={34} quality={100} priority />
      </button>

      <ul className="lpv-header-nav">
        {NAV.map(n => (
          <li key={n.id}><button onClick={() => goTo(n.id)}>{n.label}</button></li>
        ))}
      </ul>

      <button className="lpv-header-login" onClick={onLoginClick}>
        로그인 <span aria-hidden>→</span>
      </button>
    </header>
  )
}
