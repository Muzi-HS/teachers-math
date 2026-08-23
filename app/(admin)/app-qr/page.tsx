'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { IconSmartphone, IconShare } from '@/components/icons'

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'

export default function AppQrPage() {
  const [url, setUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => { setUrl(window.location.origin) }, [])

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = '티처스수학학원-앱설치-QR.png'
    a.click()
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: tx }}>앱 설치 QR</h1>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>
          학부모/선생님께 이 QR코드를 보여주면 스캔 후 홈 화면에 앱처럼 설치할 수 있습니다
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* QR 카드 */}
        <div style={{
          background: '#fff', borderRadius: 12, border: `1px solid ${bd}`,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)', padding: 28,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          width: 300,
        }}>
          {url ? (
            <QRCodeCanvas ref={canvasRef} value={url} size={220} level="M" marginSize={2}
              fgColor={navyDk} bgColor="#fff" />
          ) : (
            <div style={{ width: 220, height: 220, background: bg, borderRadius: 8 }} />
          )}
          <p style={{ fontSize: 12, color: tx2, wordBreak: 'break-all', textAlign: 'center', margin: 0 }}>{url}</p>
          <button onClick={download} disabled={!url} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: gold, color: navyDk, fontWeight: 700, fontSize: 13,
            cursor: url ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: url ? 1 : .5,
          }}>QR 이미지 다운로드</button>
        </div>

        {/* 설치 안내 */}
        <div style={{
          flex: 1, minWidth: 280,
          background: '#fff', borderRadius: 12, border: `1px solid ${bd}`,
          boxShadow: '0 1px 4px rgba(0,0,0,.06)', padding: 24,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: tx, margin: '0 0 14px' }}>설치 방법 안내</p>

          <div style={{ background: bg, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: navy, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}><IconSmartphone size={12} /> 안드로이드 (Chrome)</p>
            <p style={{ fontSize: 12, color: tx2, margin: 0, lineHeight: 1.6 }}>
              QR코드 스캔 → 사이트 접속 후 화면 하단 "설치" 배너를 누르면 바로 설치됩니다.
            </p>
          </div>

          <div style={{ background: bg, borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: navy, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}><IconSmartphone size={12} /> 아이폰 (Safari)</p>
            <p style={{ fontSize: 12, color: tx2, margin: 0, lineHeight: 1.6 }}>
              QR코드 스캔 → 사이트 접속 후 화면 하단 안내에 따라, Safari 하단 공유 버튼(<span style={{ color: navy, display: 'inline-flex', verticalAlign: 'middle' }}><IconShare size={12} /></span>)을 누르고<br/>
              "홈 화면에 추가"를 선택하면 설치됩니다.
            </p>
          </div>

          <p style={{ fontSize: 11, color: tx3, marginTop: 14 }}>
            * 이미 홈 화면에 설치되어 있는 경우, 설치 안내 배너는 자동으로 표시되지 않습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
