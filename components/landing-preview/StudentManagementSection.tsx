'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.14)', mint = '#EAF7F0'

function ProgressLine({ pct, color = deep }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 4, background: line, borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

const ITEMS = [
  {
    no: '01', tag: 'ATTENDANCE', title: '출결 관리',
    body: '학생의 등원과 수업 참여 여부를 기록합니다. 단순히 출석 여부만 확인하는 것이 아니라 지각 여부까지 함께 관리해 규칙적인 학습 습관을 만들어갈 수 있도록 합니다.',
    demo: (
      <div style={{ background: mint, borderRadius: 10, padding: '16px 18px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: deep2, letterSpacing: 1, marginBottom: 10 }}>오늘 출결</p>
        {[['출석', '정상'], ['등원', '18:02'], ['수업', '18:00'], ['지각', '2분']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: deep }}>
            <span style={{ color: deep2 }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    no: '02', tag: 'HOMEWORK', title: '숙제 이행 관리',
    body: '매 수업 숙제의 제출 여부, 숙제 이행률, 문제 정답률을 확인합니다. "숙제를 했다 / 안 했다"에서 끝나는 것이 아니라 얼마나 수행했는지, 어떤 유형에서 틀렸는지를 확인해 다음 수업과 복습에 반영합니다.',
    demo: (
      <div style={{ background: mint, borderRadius: 10, padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <p style={{ fontSize: 11, color: deep2, marginBottom: 4 }}>숙제 이행률</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: deep }}>92%</p>
          <p style={{ fontSize: 11, color: 'rgba(21,74,50,.55)' }}>23 / 25문제 완료</p>
          <ProgressLine pct={92} />
        </div>
        <div>
          <p style={{ fontSize: 11, color: deep2, marginBottom: 4 }}>숙제 정답률</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: deep }}>84%</p>
          <p style={{ fontSize: 11, color: 'rgba(21,74,50,.55)' }}>21 / 25문제 정답</p>
          <ProgressLine pct={84} color={gold} />
        </div>
      </div>
    ),
  },
  {
    no: '03', tag: 'CLASS FEEDBACK', title: '수업 피드백',
    body: '그날의 수업에서 잘했던 부분, 어려워했던 부분, 반복적으로 틀린 문제, 추가 복습이 필요한 개념, 다음 수업에서 확인할 내용을 기록합니다. 학부모가 학생의 학습 상황을 결과가 아니라 과정으로 이해할 수 있도록 합니다.',
    demo: null,
  },
]

export default function StudentManagementSection() {
  return (
    <section id="lpv-management" style={{ background: '#fff', padding: '120px 20px' }}>
      <style>{`
        .lpv-mgmt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));max-width:1080px;margin:0 auto;gap:44px 40px}
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', marginBottom: 72 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            STUDENT MANAGEMENT
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>
            수업보다 중요한 것은<br />수업 이후의 변화까지 확인하는 것입니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: deep2, wordBreak: 'keep-all' }}>
            티처스 수학학원은 학생이 단순히 학원에 다녀가는 것으로<br />
            학습이 끝났다고 생각하지 않습니다.<br /><br />
            출결, 숙제, 문제 정답률, 수업 중 이해도, 질문 내용과 피드백을 기록하여<br />
            학생의 학습 과정이 지속적으로 이어질 수 있도록 관리합니다.
          </p>
        </Reveal>
      </div>

      <div className="lpv-mgmt-grid">
        {ITEMS.map((it, i) => (
          <Reveal key={it.no} delay={i * 120}>
            <div>
              <p style={{ fontSize: 26, fontWeight: 800, color: deep, opacity: .25, marginBottom: 2, letterSpacing: -1 }}>{it.no}</p>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: gold, letterSpacing: 1.5, marginBottom: 8 }}>{it.tag}</p>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: deep, marginBottom: 12 }}>{it.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.85, color: deep2, wordBreak: 'keep-all', marginBottom: it.demo ? 16 : 0 }}>{it.body}</p>
              {it.demo}
              {it.demo && <p style={{ fontSize: 10.5, color: 'rgba(21,74,50,.45)', marginTop: 8 }}>* 화면 예시이며 실제 학생 정보가 아닙니다 (Demo Data)</p>}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
