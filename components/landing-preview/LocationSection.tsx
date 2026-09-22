'use client'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', line = 'rgba(21,74,50,.16)'

const ADDRESS = '경기 수원시 영통구 에듀타운로 102 B동 812호'
const PHONE = '010-3234-9500'
// 지도: 네이버 지도는 최근 UI 개편으로 일반 검색 결과의 "퍼가기(iframe)"가 사라져
// (스마트플레이스에 등록된 업체만 위젯 제공) API 키 없이 바로 쓸 수 있는 구글 지도
// output=embed 방식으로 우선 넣는다. 네이버 스마트플레이스에 등록하면 그때 위젯으로
// 교체하거나, Naver Cloud Platform Maps Client ID를 받으면 JS SDK로 바꿀 수 있다.
const NAVER_MAP_SEARCH_URL = `https://map.naver.com/p/search/${encodeURIComponent(ADDRESS)}`
const GOOGLE_MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`

export default function LocationSection() {
  return (
    <section id="lpv-location" style={{ background: '#EAF7F0', padding: '120px 20px 140px' }}>
      <style>{`
        .lpv-loc-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:48px;max-width:1000px;margin:0 auto;align-items:center}
        @media (max-width:760px){ .lpv-loc-grid{grid-template-columns:1fr;gap:28px} }
        .lpv-loc-map{aspect-ratio:4/3;border:1px solid ${line};border-radius:14px;overflow:hidden;position:relative;background:#fff}
        .lpv-loc-map iframe{width:100%;height:100%;border:0;display:block}
        .lpv-loc-btn{display:inline-block;padding:11px 22px;border-radius:999px;border:1.5px solid ${deep};background:transparent;color:${deep};
          font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;text-decoration:none;margin-top:14px;transition:background .15s,color .15s}
        .lpv-loc-btn:hover{background:${deep};color:#fff}
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            LOCATION
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, wordBreak: 'keep-all' }}>
            티처스 수학학원에<br />오시는 길
          </h2>
        </Reveal>
      </div>

      <Reveal delay={200}>
        <div className="lpv-loc-grid">
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: deep, marginBottom: 18 }}>티처스 수학학원</p>
            <div style={{ borderTop: `1px solid ${line}`, paddingTop: 16, marginBottom: 14 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: deep2, letterSpacing: 1, marginBottom: 4 }}>주소</p>
              <p style={{ fontSize: 14, color: deep, wordBreak: 'keep-all' }}>{ADDRESS}</p>
            </div>
            <div style={{ borderTop: `1px solid ${line}`, paddingTop: 16 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: deep2, letterSpacing: 1, marginBottom: 4 }}>전화</p>
              <a href={`tel:${PHONE.replace(/-/g, '')}`} style={{ fontSize: 14, color: deep, fontWeight: 700, textDecoration: 'none' }}>{PHONE}</a>
            </div>
          </div>

          <div>
            <div className="lpv-loc-map">
              <iframe src={GOOGLE_MAP_EMBED_URL} loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="티처스 수학학원 위치 지도" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <a className="lpv-loc-btn" href={NAVER_MAP_SEARCH_URL} target="_blank" rel="noopener noreferrer">네이버 지도에서 길찾기</a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
