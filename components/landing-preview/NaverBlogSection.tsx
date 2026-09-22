'use client'
import { useEffect, useState } from 'react'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.14)'

type BlogItem = { title: string; link: string; pubDate: string; excerpt: string; thumbnail: string | null }

function fmtDate(pubDate: string) {
  const d = new Date(pubDate)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function NaverBlogSection() {
  const [items, setItems] = useState<BlogItem[] | null>(null)
  const [blogUrl, setBlogUrl] = useState('https://blog.naver.com/teachers_edu')

  useEffect(() => {
    let cancelled = false
    fetch('/api/naver-blog?limit=5').then(r => r.json()).then(data => {
      if (cancelled) return
      setItems(data.items ?? [])
      if (data.blogUrl) setBlogUrl(data.blogUrl)
    }).catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <section style={{ background: '#fff', padding: '120px 20px' }}>
      <style>{`
        .lpv-blog-list{max-width:760px;margin:0 auto;border-top:1px solid ${line}}
        .lpv-blog-row{display:flex;align-items:baseline;gap:20px;padding:22px 4px;border-bottom:1px solid ${line};
          text-decoration:none;color:inherit;transition:background .18s ease}
        .lpv-blog-row:hover{background:#FBFAF6}
        .lpv-blog-row:hover .lpv-blog-arrow{transform:translateX(3px);opacity:1}
        .lpv-blog-row:focus-visible{outline:2px solid ${gold};outline-offset:-2px}
        .lpv-blog-date{flex-shrink:0;font-size:12px;font-weight:600;color:rgba(21,74,50,.5);width:70px;padding-top:2px}
        .lpv-blog-main{flex:1;min-width:0}
        .lpv-blog-title{font-size:15px;font-weight:700;color:${deep};line-height:1.5;margin:0 0 6px;word-break:keep-all}
        .lpv-blog-excerpt{font-size:12.5px;color:${deep2};line-height:1.7;margin:0;
          display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
        .lpv-blog-arrow{flex-shrink:0;color:${gold};font-size:15px;opacity:.4;transition:transform .18s ease,opacity .18s ease;padding-top:2px}
        .lpv-blog-more{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:${deep};
          text-decoration:none;padding:10px 4px}
        .lpv-blog-more:hover{color:${gold}}
        @media (max-width:520px){
          .lpv-blog-row{flex-direction:column;align-items:stretch;gap:6px;padding:18px 4px}
          .lpv-blog-date{width:auto;order:2}
          .lpv-blog-main{width:100%;order:1}
          .lpv-blog-arrow{display:none}
        }
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', marginBottom: 56 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            BLOG
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>
            수업 현장의 이야기를<br />블로그에 기록합니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>
            학생들의 성장 과정, 시험 분석, 학습 노하우를 네이버 블로그에서 자세히 확인하실 수 있습니다.
          </p>
        </Reveal>
      </div>

      <Reveal delay={250}>
        {items === null ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: deep2 }}>불러오는 중...</p>
        ) : items.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: deep2 }}>
            최근 글을 불러오지 못했습니다.{' '}
            <a href={blogUrl} target="_blank" rel="noopener noreferrer" style={{ color: gold, fontWeight: 700 }}>블로그에서 바로 보기</a>
          </p>
        ) : (
          <div className="lpv-blog-list">
            {items.map(item => (
              <a key={item.link} className="lpv-blog-row" href={item.link} target="_blank" rel="noopener noreferrer">
                <span className="lpv-blog-date">{fmtDate(item.pubDate)}</span>
                <span className="lpv-blog-main">
                  <p className="lpv-blog-title">{item.title}</p>
                  {item.excerpt && <p className="lpv-blog-excerpt">{item.excerpt}</p>}
                </span>
                <span className="lpv-blog-arrow" aria-hidden>→</span>
              </a>
            ))}
          </div>
        )}
      </Reveal>

      <div style={{ textAlign: 'center', marginTop: 36 }}>
        <a className="lpv-blog-more" href={blogUrl} target="_blank" rel="noopener noreferrer">
          네이버 블로그에서 더보기 <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  )
}
