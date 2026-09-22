'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.14)'

function ProgressLine({ pct, color = deep }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 5, background: line, borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 1s ease' }} />
    </div>
  )
}

function AccentBlock({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ width: 3, borderRadius: 2, background: color, alignSelf: 'stretch' }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color, marginBottom: 8 }}>{title}</p>
        {children}
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 0' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: gold, letterSpacing: 1.5, marginBottom: 10 }}>{title}</p>
      {children}
    </div>
  )
}

export default function LessonRecordPreviewSection() {
  return (
    <section style={{ background: '#EAF7F0', padding: '120px 20px' }}>
      <style>{`
        .lpv-card{max-width:680px;margin:0 auto;background:#fff;border:1px solid ${line};border-radius:16px;
          padding:0;overflow:hidden;box-shadow:0 2px 24px rgba(21,74,50,.06)}
        .lpv-card-col{padding:0 36px}
        .lpv-card-col > div + div{border-top:1px solid ${line}}
        @media (max-width:640px){
          .lpv-card-col{padding:0 22px}
        }
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', marginBottom: 56 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            LESSON RECORD
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>
            수업이 끝난 뒤에도<br />학습의 과정은 기록됩니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: deep2, wordBreak: 'keep-all' }}>
            학부모가 &ldquo;오늘 학원에서 무엇을 공부했는지&rdquo;, &ldquo;숙제는 얼마나 했는지&rdquo;,<br />
            &ldquo;어떤 부분을 어려워하는지&rdquo;를 확인할 수 있도록 수업 내용을 기록하여 제공합니다.
          </p>
        </Reveal>
      </div>

      <Reveal>
        <div className="lpv-card">
          <div style={{ padding: '26px 36px', borderBottom: `1px solid ${line}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: gold, letterSpacing: 2, marginBottom: 4 }}>TEACHERS MATH</p>
              <p style={{ fontSize: 17, fontWeight: 800, color: deep }}>수업 기록 카드</p>
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {[['학생', '김○○'], ['수업일', '2026.09.22'], ['과목', '중등수학']].map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontSize: 10.5, color: deep2 }}>{k}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: deep }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lpv-card-col">
            <Block title="출결">
              {[['등원', '18:02'], ['수업 시작', '18:00'], ['지각', '2분']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0', color: deep }}>
                  <span style={{ color: deep2 }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </Block>
            <Block title="숙제 이행률">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <p style={{ fontSize: 12.5, color: deep2, marginBottom: 2 }}>이행률</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: deep }}>92%</p>
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.55)' }}>23 / 25</p>
                  <ProgressLine pct={92} />
                </div>
                <div>
                  <p style={{ fontSize: 12.5, color: deep2, marginBottom: 2 }}>정답률</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: deep }}>84%</p>
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.55)' }}>21 / 25</p>
                  <ProgressLine pct={84} color={gold} />
                </div>
              </div>
            </Block>
            <Block title="오늘의 수업">
              <AccentBlock title="원의 방정식" color={deep}>
                <ul style={{ margin: 0, paddingLeft: 18, color: deep2, fontSize: 13, lineHeight: 1.9 }}>
                  <li>원의 방정식 기본형</li>
                  <li>중심과 반지름 구하기</li>
                  <li>직선과 원의 위치관계</li>
                </ul>
              </AccentBlock>
            </Block>
            <Block title="오늘의 숙제">
              <AccentBlock title="다음 수업까지" color={gold}>
                <ul style={{ margin: 0, paddingLeft: 18, color: deep2, fontSize: 13, lineHeight: 1.9 }}>
                  <li>개념원리 RPM p.86~92 문제 풀이</li>
                  <li>오늘 헷갈렸던 판별식 활용 문제 오답노트 정리</li>
                </ul>
              </AccentBlock>
            </Block>
            <Block title="오늘의 피드백">
              <div style={{ background: 'rgba(21,74,50,.05)', borderLeft: `3px solid ${deep}`, borderRadius: '0 8px 8px 0', padding: '12px 14px' }}>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>
                  기본 개념에 대한 이해도는 좋은 편입니다. 원의 중심과 반지름을 찾는 문제는 안정적으로 해결하고 있습니다.
                  다만 직선과 원의 위치관계를 판단하는 문제에서 판별식을 적용하는 과정에 실수가 있어 추가 연습이 필요합니다.
                </p>
              </div>
            </Block>
          </div>

          <p style={{ fontSize: 10.5, color: 'rgba(21,74,50,.45)', padding: '16px 36px', borderTop: `1px solid ${line}` }}>
            * 화면에 표시된 학생 이름과 학습 기록은 서비스 설명을 위한 예시 데이터입니다.
          </p>
        </div>
      </Reveal>

      <Reveal delay={150}>
        <p style={{
          maxWidth: 640, margin: '90px auto 0', textAlign: 'center', fontSize: 'clamp(19px, 2.6vw, 25px)',
          fontWeight: 700, color: deep, lineHeight: 1.7, wordBreak: 'keep-all',
        }}>
          관리의 목적은 학생을 통제하는 것이 아니라,<br />학생이 자신의 학습을 스스로 이어갈 수 있도록 돕는 것입니다.
        </p>
      </Reveal>
    </section>
  )
}
