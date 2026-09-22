'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.14)'

const METHODS = [
  {
    no: '01', tag: 'LECTURE', title: '강의식 수업',
    body: '새로운 개념과 중요한 원리를 선생님의 설명을 통해 체계적으로 학습합니다.\n단순히 공식을 전달하기보다 "왜 이런 공식이 만들어지는가", "어떤 상황에서 사용해야 하는가"를 이해할 수 있도록 설명합니다.',
    keywords: ['개념 이해', '원리 설명', '대표 문제', '풀이 전략'],
  },
  {
    no: '02', tag: 'INDIVIDUAL COACHING', title: '개별지도',
    body: '개념을 이해하는 속도와 문제를 해결하는 과정은 학생마다 다릅니다.\n수업 중 학생의 풀이 과정을 확인하고 막히는 부분, 잘못 이해한 개념, 반복적으로 발생하는 실수를 찾아 학생에게 필요한 설명과 문제를 개별적으로 제공합니다.',
    keywords: ['개별 질문', '오답 점검', '취약 개념', '맞춤 문제', '학습 속도 조절'],
  },
]

export default function TeachingMethodSection() {
  return (
    <section id="lpv-teaching" style={{ background: '#FBFAF6', padding: '120px 20px' }}>
      <style>{`
        .lpv-method-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));max-width:1040px;margin:0 auto;gap:0}
        .lpv-method-item{padding:8px 40px}
        .lpv-method-item + .lpv-method-item{border-left:1px solid ${line}}
        @media (max-width:760px){
          .lpv-method-item{padding:32px 4px 0}
          .lpv-method-item + .lpv-method-item{border-left:none;border-top:1px solid ${line}}
        }
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', marginBottom: 72 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            TEACHING METHOD · 수업 방식
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>
            같은 목표를 향하더라도<br />학생마다 필요한 수업은 다릅니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: deep2, wordBreak: 'keep-all' }}>
            티처스 수학학원은 개념을 체계적으로 이해하는 강의식 수업과<br />
            학생의 현재 학습 상태에 맞춘 개별지도를 함께 운영합니다.<br /><br />
            설명을 듣는 것에서 끝나는 수업이 아니라, 이해하고 직접 풀고,<br />
            틀린 이유를 확인하고, 다시 해결하는 과정까지 이어지도록 지도합니다.
          </p>
        </Reveal>
      </div>

      <div className="lpv-method-grid">
        {METHODS.map((m, i) => (
          <Reveal key={m.no} delay={i * 130}>
            <div className="lpv-method-item">
              <p style={{ fontSize: 34, fontWeight: 800, color: deep, opacity: .25, marginBottom: 4, letterSpacing: -1 }}>{m.no}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: gold, letterSpacing: 2, marginBottom: 10 }}>{m.tag}</p>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: deep, marginBottom: 14 }}>{m.title}</h3>
              {m.body.split('\n').map((p, pi) => (
                <p key={pi} style={{ fontSize: 13.5, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all', marginBottom: pi < m.body.split('\n').length - 1 ? 10 : 18 }}>{p}</p>
              ))}
              <p style={{ fontSize: 12, color: 'rgba(21,74,50,.55)', lineHeight: 1.9 }}>{m.keywords.join(' · ')}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
