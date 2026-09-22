'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', cream = '#FBFAF6'

export default function AboutSectionAlt() {
  return (
    <section id="lpv-about" style={{ background: cream, padding: '120px 20px', textAlign: 'center' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 22 }}>
            ABOUT TEACHERS MATH
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{
            fontSize: 'clamp(22px, 4.2vw, 34px)', fontWeight: 800, color: deep,
            lineHeight: 1.5, marginBottom: 26, wordBreak: 'keep-all', letterSpacing: '-0.01em',
          }}>
            우리는 스스로를<br />&lsquo;성장업&rsquo;이라 부릅니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 'clamp(14px, 1.8vw, 16.5px)', lineHeight: 2, color: deep2, fontWeight: 400, wordBreak: 'keep-all' }}>
            빠르게 이해하는 재능보다, 꾸준히 나아가는 힘을 더 크게 봅니다.<br />
            한 번의 정답보다 스스로 생각하고, 시도하고, 다시 일어서는 과정을 중요하게 생각합니다.<br /><br />
            학생이 수학을 통해 더 단단해지는 경험을 만드는 것이<br />
            우리가 지향하는 교육입니다.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
