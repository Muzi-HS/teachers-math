'use client'
import { useAppInstall } from '@/context/AppInstallContext'
import Image from 'next/image'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13'

export default function InstallSection() {
  const { installed, installing, message, install } = useAppInstall()

  if (installed) return null

  return (
    <section style={{ background: '#FBFAF6', padding: '120px 20px' }}>
      <style>{`
        .lpv-install-ways{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));max-width:640px;margin:56px auto 0;gap:44px 56px;text-align:left}
        .lpv-install-way-label{font-size:11px;font-weight:700;color:${gold};letter-spacing:1.5px;margin-bottom:12px}
        .lpv-install-steps{margin:0;padding-left:18px;color:${deep2};font-size:13px;line-height:1.95}
        .lpv-install-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:999px;border:none;
          background:${deep};color:#fff;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s;margin-top:2px}
        .lpv-install-btn:hover:not(:disabled){background:#0F3A26}
        .lpv-install-btn:disabled{opacity:.6;cursor:default}
        @media (max-width:640px){
          .lpv-install-ways{text-align:center}
          .lpv-install-steps{text-align:left;list-style-position:inside;padding-left:0;display:inline-block}
        }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <Image src="/app-icon-v2-512.png" alt="" width={48} height={48} style={{ display: 'block', margin: '0 auto 18px', borderRadius: 12 }} />
        </Reveal>
        <Reveal delay={80}>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 16 }}>APP</span>
        </Reveal>
        <Reveal delay={140}>
          <h2 style={{ fontSize: 'clamp(20px, 3.4vw, 26px)', fontWeight: 800, color: deep, marginBottom: 14, wordBreak: 'keep-all' }}>
            앱처럼 빠르게 이용하세요
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 13.5, color: deep2, lineHeight: 1.85, wordBreak: 'keep-all' }}>
            홈 화면에 추가하면 주소 입력 없이 바로 접속할 수 있고,<br />공지·수업기록 알림도 놓치지 않고 받아보실 수 있어요.
          </p>
        </Reveal>
      </div>

      <Reveal delay={260}>
        <div className="lpv-install-ways">
          <div>
            <p className="lpv-install-way-label">iPHONE (iOS)</p>
            <ol className="lpv-install-steps">
              <li>Safari 공유 버튼을 눌러주세요</li>
              <li><strong style={{ color: deep }}>&lsquo;홈 화면에 추가&rsquo;</strong>를 선택해주세요</li>
              <li><strong style={{ color: deep }}>&lsquo;추가&rsquo;</strong>를 누르면 완료됩니다</li>
            </ol>
          </div>

          <div>
            <p className="lpv-install-way-label">안드로이드 · PC</p>
            <p style={{ fontSize: 13, color: deep2, lineHeight: 1.85, marginBottom: 14 }}>버튼 한 번으로 바로 설치할 수 있어요.</p>
            <button className="lpv-install-btn" onClick={install} disabled={installing}>
              {installing ? '설치 중...' : '지금 설치하기'}
            </button>
            {message && (
              <p role="status" style={{ fontSize: 12, color: deep2, lineHeight: 1.7, marginTop: 10 }}>
                {message}
              </p>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  )
}
