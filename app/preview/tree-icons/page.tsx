import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '나무 성장형 아이콘 에셋 | 티처스 수학학원',
  robots: { index: false, follow: false },
}

// 제공받은 PNG 6개를 그대로 사용 — public/assets/streak-tree/
const stages = [
  { day: '5일', file: 'seed.png' },
  { day: '10일', file: 'sprout.png' },
  { day: '15일', file: 'young-tree.png' },
  { day: '20일', file: 'branch-growth.png' },
  { day: '25일', file: 'full-tree.png' },
  { day: '30일', file: 'fruit-tree.png' },
]

export default function Page() {
  return (
    <div style={{ minHeight: '100dvh', background: '#F3F7F4', padding: '48px 24px', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: '#587260', margin: '0 0 8px' }}>ASSET PREVIEW · 실제 UI에는 적용되어 있음</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#164B37', margin: '0 0 28px' }}>나무 성장형 아이콘 6단계 (제공 PNG 원본)</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, background: '#fff', border: '1px solid #E5EEE7', borderRadius: 16, padding: 28 }}>
          {stages.map(s => (
            <div key={s.file} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 100 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/streak-tree/${s.file}`} alt={s.day} width={64} height={64} style={{ objectFit: 'contain' }} />
              <span style={{ fontSize: 12, color: '#586C61' }}>{s.day}</span>
              <code style={{ fontSize: 9, color: '#8AA091', wordBreak: 'break-all', textAlign: 'center' }}>{s.file}</code>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#586C61', marginTop: 20 }}>
          실제 적용 화면: <a href="/preview/streak-v2" style={{ color: '#164B37' }}>/preview/streak-v2</a> → &ldquo;학습 습관 성장&rdquo; 탭 (연속 숙제 이행 카드의 milestone 아이콘)
        </p>
      </div>
    </div>
  )
}
