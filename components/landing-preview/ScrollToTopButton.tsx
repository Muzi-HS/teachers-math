'use client'
import { useEffect, useState } from 'react'

const deep = '#154A32'

export default function ScrollToTopButton() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    function onScroll() {
      setShown(window.scrollY > window.innerHeight * 0.6)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <button
      className="lpv-totop" data-shown={shown} onClick={scrollToTop} aria-label="맨 위로 이동" aria-hidden={!shown} tabIndex={shown ? 0 : -1}
    >
      <style>{`
        .lpv-totop{
          position:fixed;right:20px;bottom:20px;z-index:60;
          width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;
          background:${deep};color:#fff;display:flex;align-items:center;justify-content:center;
          box-shadow:0 6px 20px rgba(21,74,50,.28);
          opacity:0;transform:translateY(14px) scale(.9);pointer-events:none;
          transition:opacity .3s ease,transform .3s ease,background .15s ease;
        }
        .lpv-totop[data-shown="true"]{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
        .lpv-totop:hover{background:#0F3A26}
        .lpv-totop:focus-visible{outline:2px solid #D87E13;outline-offset:3px}
        @media (max-width:640px){
          .lpv-totop{right:14px;bottom:14px;width:42px;height:42px}
        }
        @media (prefers-reduced-motion: reduce){
          .lpv-totop{transition:opacity .15s ease}
        }
      `}</style>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}
