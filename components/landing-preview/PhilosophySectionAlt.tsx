'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', line = 'rgba(21,74,50,.14)'

const ITEMS = [
  { no: '01', title: '재능보다 꾸준함', body: '빨리 이해하는 재능보다 꾸준함이 더 큰 재능입니다. 학생별 학습 상태에 맞춰 반복과 복습이 자연스럽게 이어지도록 학습 과정을 설계합니다.' },
  { no: '02', title: '주눅들지 않는 마음', body: '수학이 어려운 학생도 그 앞에서 주눅들지 않도록 돕습니다. 부족한 재능이어도 꾸준한 노력을 통해 스스로를 믿는 힘을 기릅니다.' },
  { no: '03', title: '인격적 성장', body: '교과 지식의 성장만큼, 겸손하고 흔들리지 않는 마음가짐을 함께 지도합니다. 학원을 넘어 혼자서도 나아갈 수 있는 사람을 만드는 것이 목표입니다.' },
]

export default function PhilosophySectionAlt() {
  return (
    <section style={{ background: '#fff', padding: '120px 20px 0' }}>
      <style>{`
        .lpv-phi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));max-width:1040px;margin:0 auto}
        .lpv-phi-item{padding:8px 36px;border-left:1px solid ${line}}
        .lpv-phi-item:first-child{border-left:none}
        @media (max-width:760px){
          .lpv-phi-grid{grid-template-columns:1fr;gap:48px}
          .lpv-phi-item{border-left:none;border-top:1px solid ${line};padding:32px 4px 0}
          .lpv-phi-item:first-child{border-top:none;padding-top:0}
        }
        .lpv-closing{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;max-width:1040px;margin:0 auto;align-items:start}
        @media (max-width:760px){ .lpv-closing{grid-template-columns:1fr;gap:22px} }
      `}</style>

      <div className="lpv-phi-grid">
        {ITEMS.map((it, i) => (
          <Reveal key={it.no} delay={i * 130}>
            <div className="lpv-phi-item">
              <p style={{ fontSize: 15, fontWeight: 700, color: deep, opacity: .35, marginBottom: 22, letterSpacing: 1 }}>{it.no}</p>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: deep, marginBottom: 16, wordBreak: 'keep-all' }}>{it.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>{it.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div style={{ height: 1, background: line, maxWidth: 1040, margin: '110px auto 0' }} />

      <div className="lpv-closing" style={{ padding: '90px 20px 140px' }}>
        <Reveal>
          <p style={{
            fontSize: 'clamp(21px, 3.4vw, 30px)', fontWeight: 800, color: deep,
            lineHeight: 1.55, wordBreak: 'keep-all', letterSpacing: '-0.01em',
          }}>
            &ldquo;잘하는 학생&rdquo;보다<br />&ldquo;계속 성장하는 학생&rdquo;을<br />만들고 싶습니다.
          </p>
        </Reveal>
        <Reveal delay={150}>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: deep2, wordBreak: 'keep-all', paddingTop: 6 }}>
            우리는 단기간의 점수 상승만을 목표로 하지 않습니다.<br /><br />
            학생이 스스로 고민하고, 틀리고, 다시 시도하고, 끝내 해결하는 경험이<br />
            수학 실력뿐 아니라 앞으로 무엇인가를 배워가는 힘으로 이어진다고 믿습니다.<br /><br />
            그 성장으로부터, 학생들이 진정한 자유를 얻기를 바랍니다.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
