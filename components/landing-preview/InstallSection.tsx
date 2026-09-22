'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Reveal from './Reveal'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function isStandalone() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

export default function InstallSection() {
  // isStandalone()은 typeof window === 'undefined'일 때(서버) true를 반환하므로,
  // 이걸 lazy initializer로 읽으면 서버는 "설치됨"(섹션 없음)으로, 실제 브라우저에서
  // 다시 계산되는 클라이언트는 "설치 안 됨"(섹션 있음)으로 서로 다르게 렌더링되어
  // 하이드레이션 불일치가 난다. 서버와 똑같이 false로 시작하고, 실제 판별은
  // 마운트 후 effect에서만 한다(InstallBanner.tsx와 동일한 패턴).
  const [installed, setInstalled] = useState(false)
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [notReadyHint, setNotReadyHint] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 전용 API(matchMedia)라 서버에서는 알 수 없고, 마운트 직후 한 번만 동기화하면 되는 값이다.
    if (isStandalone()) { setInstalled(true); return }
    function onBIP(e: Event) { e.preventDefault(); setDeferred(e as BIPEvent) }
    function onInstalled() { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) {
      // beforeinstallprompt 이벤트가 아직 브라우저에서 발생하지 않은 상태 — 이 API는 브라우저가
      // 자체적으로 준비했을 때만 호출 가능해 코드로 강제할 수 없다. 잠시 후 다시 시도하도록 안내한다.
      setNotReadyHint(true)
      setTimeout(() => setNotReadyHint(false), 4000)
      return
    }
    setInstalling(true)
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setInstalling(false)
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

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
          <Image src="/app-icon-v2-512.png" alt="" width={48} height={48} style={{ borderRadius: 12, marginBottom: 18 }} />
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
            {notReadyHint && (
              <p role="status" style={{ fontSize: 12, color: deep2, lineHeight: 1.7, marginTop: 10 }}>
                아직 설치 준비 중이에요. 잠시 후 다시 눌러보시거나, 브라우저 메뉴에서{' '}
                <strong style={{ color: deep }}>&lsquo;홈 화면에 추가&rsquo;</strong> 또는 <strong style={{ color: deep }}>&lsquo;앱 설치&rsquo;</strong>를 선택해주세요.
              </p>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  )
}
