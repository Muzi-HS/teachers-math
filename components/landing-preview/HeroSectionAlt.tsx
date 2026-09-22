'use client'
import { useEffect, useRef } from 'react'
import Image from 'next/image'
import SpecialClassBanner from './SpecialClassBanner'

const mint = '#EAF7F0', deep = '#154A32', deep2 = '#2A6349'

export default function HeroSectionAlt() {
  const heroRef = useRef<HTMLElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLButtonElement>(null)

  // 마우스를 따라가는 은은한 빛 — 리렌더를 유발하지 않도록 ref로 직접 DOM에 반영한다. 터치 기기·prefers-reduced-motion에서는 끈다.
  useEffect(() => {
    const hero = heroRef.current, glow = glowRef.current
    if (!hero || !glow) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    function onMove(e: MouseEvent) {
      const rect = hero!.getBoundingClientRect()
      glow!.style.setProperty('--gx', `${e.clientX - rect.left}px`)
      glow!.style.setProperty('--gy', `${e.clientY - rect.top}px`)
      glow!.style.opacity = '1'
    }
    function onLeave() { glow!.style.opacity = '0' }
    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('mouseleave', onLeave)
    return () => { hero.removeEventListener('mousemove', onMove); hero.removeEventListener('mouseleave', onLeave) }
  }, [])

  // 스크롤 시 Hero 콘텐츠가 아주 약하게 위로 밀리며 옅어지는 정도의 움직임만 준다.
  // 스크롤 큐는 화면(뷰포트) 기준 고정이라 Hero 내용 길이와 무관하게 첫 화면 하단에 항상 보이고,
  // 어느 정도 스크롤하면 사라진다. entrance는 CSS animation이 아니라 data-shown 속성 하나로만
  // 제어한다 — CSS Animation은 inline style보다 우선순위가 높아서, 등장 애니메이션과 스크롤 시
  // 사라지는 로직을 동시에 opacity에 걸면 등장 애니메이션이 계속 이겨서 사라지지 않는다.
  useEffect(() => {
    const hero = heroRef.current, content = contentRef.current, cue = cueRef.current
    if (!hero || !content || !cue) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let entered = reduced
    let raf = 0
    function apply() {
      const h = hero!.offsetHeight
      const p = Math.min(1, Math.max(0, window.scrollY / h))
      if (!reduced) {
        content!.style.transform = `translateY(${p * 36}px)`
        content!.style.opacity = `${1 - p * 0.7}`
      }
      cue!.setAttribute('data-shown', String(entered && p <= 0.28))
    }
    function onScroll() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const enterTimer = setTimeout(() => { entered = true; apply() }, reduced ? 0 : 2400)
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); clearTimeout(enterTimer) }
  }, [])

  function scrollToAbout() {
    document.getElementById('lpv-about')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section ref={heroRef} className="lpv-hero">
      <style>{`
        .lpv-hero{position:relative;overflow:hidden;min-height:100dvh;background:${mint};display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;padding:clamp(96px,18vh,190px) 24px 120px;isolation:isolate}
        .lpv-glow{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s ease;background:radial-gradient(320px circle at var(--gx,50%) var(--gy,50%), rgba(21,74,50,.07), transparent 70%);z-index:0}
        .lpv-hero-inner{position:relative;z-index:1;max-width:min(880px,92vw);width:100%;transition:transform .1s linear,opacity .1s linear}
        .lpv-line{opacity:0;height:1px;background:rgba(21,74,50,.3);transform:scaleX(0);transform-origin:center;animation:lpv-line-in .8s cubic-bezier(.16,1,.3,1) forwards}
        .lpv-fade{opacity:0;transform:translateY(20px);animation:lpv-fade-in .8s cubic-bezier(.16,1,.3,1) forwards}
        @keyframes lpv-fade-in{to{opacity:1;transform:translateY(0)}}
        @keyframes lpv-line-in{to{opacity:1;transform:scaleX(1)}}
        .lpv-scrollcue{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;color:${deep2};background:none;border:none;cursor:pointer;font-family:inherit;z-index:40;opacity:0;pointer-events:none;transition:opacity .4s ease}
        .lpv-scrollcue[data-shown="true"]{opacity:1;pointer-events:auto}
        .lpv-scrollcue span{font-size:11px;letter-spacing:2px;font-weight:600}
        .lpv-scrollline{width:1px;height:26px;background:rgba(21,74,50,.35);position:relative;overflow:hidden}
        .lpv-scrollline::after{content:'';position:absolute;top:-100%;left:0;width:100%;height:100%;background:${deep2};animation:lpv-scrolldrip 2.2s ease-in-out infinite}
        @keyframes lpv-scrolldrip{0%{top:-100%}60%{top:100%}100%{top:100%}}
        @media (prefers-reduced-motion: reduce){
          .lpv-line,.lpv-fade{animation:none!important;opacity:1!important;transform:none!important}
          .lpv-scrollline::after{animation:none!important;top:0}
        }
        @media (max-width:640px){
          .lpv-hero{padding:88px 20px 110px}
        }
      `}</style>

      <div ref={glowRef} className="lpv-glow" aria-hidden />

      {/* absolute로 Hero 상단 빈 여백(padding-top) 위에 겹쳐 보이도록 해, 배너가 있어도
          없을 때와 동일하게 제목 등 Hero 콘텐츠 위치가 아래로 밀리지 않게 한다 */}
      <SpecialClassBanner />

      <div ref={contentRef} className="lpv-hero-inner">
        <h1 style={{
          fontSize: 'clamp(36px, 6.4vw, 76px)', lineHeight: 1.28, letterSpacing: '-0.02em',
          marginBottom: 34, color: deep, wordBreak: 'keep-all',
        }}>
          <span className="lpv-fade" style={{ display: 'inline-block', fontWeight: 800, animationDelay: '.1s' }}>꾸준히</span>
          <span className="lpv-fade" style={{ display: 'inline-block', fontWeight: 300, margin: '0 0.28em', animationDelay: '.35s' }}>그리고</span>
          <span className="lpv-fade" style={{ display: 'inline-block', fontWeight: 800, animationDelay: '.6s' }}>단단히</span>
        </h1>

        <div className="lpv-line" style={{ maxWidth: 540, margin: '0 auto 32px', animationDelay: '.95s' }} />

        <div className="lpv-fade" style={{ animationDelay: '1.2s', marginBottom: 32 }}>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 21px)', lineHeight: 1.9, fontWeight: 500, color: deep2, wordBreak: 'keep-all' }}>
            성장하는 사람이 되기를,<br />한번 더 성장하는 것의 무한한 가치를 믿으며
          </p>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 21px)', lineHeight: 1.9, fontWeight: 500, color: deep2, marginTop: 16, wordBreak: 'keep-all' }}>
            이를 위해 고민하고 노력하는 사람이 되기를,<br />그리고 자유롭게 살아가기를
          </p>
        </div>

        <div className="lpv-line" style={{ maxWidth: 540, margin: '0 auto 38px', animationDelay: '1.55s' }} />

        <div className="lpv-fade" style={{ animationDelay: '1.85s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {/* 원본 로고 실제 비율(343:209)을 지켜 찌그러지지 않게 렌더링한다 */}
          <Image src="/logo-green.png" alt="티처스 수학학원 로고" width={78} height={48} style={{ objectFit: 'contain', flexShrink: 0 }} priority />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: deep, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>티처스 수학학원</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(21,74,50,.55)', letterSpacing: 3.5, lineHeight: 1, margin: 0, marginTop: 6 }}>TEACHERS MATH</p>
          </div>
        </div>
      </div>

      <button ref={cueRef} className="lpv-scrollcue" onClick={scrollToAbout} aria-label="아래로 스크롤">
        <span>SCROLL</span>
        <div className="lpv-scrollline" />
      </button>
    </section>
  )
}
