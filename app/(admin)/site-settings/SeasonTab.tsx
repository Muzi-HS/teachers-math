'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchSiteSettings, saveSiteSettings, DEFAULT_SITE_SETTINGS, type SiteSettings } from '@/lib/site-settings'
import { getSeasonByDate, type Season, type SeasonMode, type SeasonIntensity } from '@/lib/season'
import SeasonEffect from '@/components/season/SeasonEffect'

const navy = 'var(--ui-primary)'
const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'
const gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)'

const SEASON_LABEL: Record<Season, string> = { spring: '봄 (벚꽃)', autumn: '가을 (낙엽)', winter: '겨울 (눈)', none: '없음' }
const INTENSITY_LABEL: Record<SeasonIntensity, string> = { low: '약하게', normal: '보통', high: '많이' }

function Radio({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8,
      border: `1.5px solid ${checked ? navy : bd}`, background: checked ? 'var(--ui-surface-2)' : '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, fontSize: 13,
      color: checked ? navy : tx2, fontWeight: checked ? 700 : 500, transition: 'all .15s',
    }}>
      <input type="radio" checked={checked} onChange={onChange} disabled={disabled} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }} />
      {label}
    </label>
  )
}

export default function SeasonTab() {
  const { teacher } = useAuth()
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
  const [previewOn, setPreviewOn] = useState(false)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => {
    fetchSiteSettings().then(s => { setSettings(s); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!previewOn) return
    const timer = setTimeout(() => setPreviewOn(false), 8000)
    return () => clearTimeout(timer)
  }, [previewOn])

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const { error } = await saveSiteSettings(settings, teacher?.userId ?? null)
    setSaving(false)
    if (error) return toast('저장 실패: ' + error, false)
    toast('계절 효과 설정이 저장되었습니다.')
  }

  const autoSeason = getSeasonByDate()
  const previewSeason = settings.seasonMode === 'auto' ? autoSeason : settings.season

  if (loading) return <p style={{ fontSize: 13, color: tx3 }}>불러오는 중...</p>

  return (
    <div>
      {notif && (
        <div style={{ background: notif.ok ? gbg : 'var(--ui-danger-bg)', border: `1px solid ${notif.ok ? gr : 'var(--ui-danger)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: notif.ok ? gr : 'var(--ui-danger)', fontWeight: 600 }}>
          {notif.ok ? '✓ ' : ''}{notif.msg}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)', padding: 22 }}>
        {/* 계절 효과 사용 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: tx, margin: 0 }}>계절 효과 사용</p>
            <p style={{ fontSize: 12, color: tx3, margin: '3px 0 0' }}>OFF 상태에서는 홈페이지에 효과가 전혀 표시되지 않습니다</p>
          </div>
          <button
            role="switch" aria-checked={settings.seasonEffectEnabled}
            onClick={() => update('seasonEffectEnabled', !settings.seasonEffectEnabled)}
            style={{
              width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative',
              background: settings.seasonEffectEnabled ? navy : bd, transition: 'background .2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: settings.seasonEffectEnabled ? 23 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }} />
          </button>
        </div>

        <fieldset disabled={!settings.seasonEffectEnabled} style={{ border: 0, padding: 0, margin: 0, opacity: settings.seasonEffectEnabled ? 1 : .45 }}>
          {/* 적용 방식 */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: tx2, margin: '0 0 8px' }}>적용 방식</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Radio checked={settings.seasonMode === 'manual'} onChange={() => update('seasonMode', 'manual' as SeasonMode)} label="직접 선택" />
              <Radio checked={settings.seasonMode === 'auto'} onChange={() => update('seasonMode', 'auto' as SeasonMode)} label="자동 (날짜 기준)" />
            </div>
            <p style={{ fontSize: 11.5, color: tx3, margin: '8px 0 0', lineHeight: 1.6 }}>
              <strong style={{ color: tx2 }}>직접 선택</strong>: 아래에서 고른 계절을 항상 그대로 사용합니다.<br />
              <strong style={{ color: tx2 }}>자동</strong>: 오늘 날짜로 계절을 판단해 매번 자동으로 바꿔줍니다 (3~5월 봄, 9~11월 가을, 12~2월 겨울, 6~8월은 효과 없음).
            </p>
            {settings.seasonMode === 'auto' && (
              <p style={{ fontSize: 11.5, color: tx3, margin: '8px 0 0' }}>
                오늘 날짜 기준 자동 적용 계절: <strong style={{ color: navy }}>{SEASON_LABEL[autoSeason]}</strong>
                {autoSeason === 'none' && ' (6~8월은 기본적으로 효과 없음)'}
              </p>
            )}
          </div>

          {/* 계절 선택 */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: tx2, margin: '0 0 8px' }}>계절 {settings.seasonMode === 'auto' && '(자동 모드에서는 사용되지 않음)'}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['spring', 'autumn', 'winter'] as const).map(s => (
                <Radio key={s} checked={settings.season === s} onChange={() => update('season', s)} label={SEASON_LABEL[s]} disabled={settings.seasonMode === 'auto'} />
              ))}
            </div>
          </div>

          {/* 효과 강도 */}
          <div style={{ marginBottom: 4 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: tx2, margin: '0 0 8px' }}>효과 강도</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['low', 'normal', 'high'] as const).map(i => (
                <Radio key={i} checked={settings.seasonIntensity === i} onChange={() => update('seasonIntensity', i)} label={INTENSITY_LABEL[i]} />
              ))}
            </div>
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${bd}` }}>
          <button
            onClick={() => setPreviewOn(true)}
            disabled={!settings.seasonEffectEnabled || previewSeason === 'none' || previewOn}
            style={{
              padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${navy}`, background: '#fff', color: navy, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (!settings.seasonEffectEnabled || previewSeason === 'none') ? .5 : 1,
            }}
          >
            {previewOn ? '미리보는 중... (8초)' : '미리보기'}
          </button>
          <button
            onClick={save} disabled={saving}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
              background: navy, color: 'var(--ui-primary-text)', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? .7 : 1, fontFamily: 'inherit', marginLeft: 'auto',
            }}
          >
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </div>

      {/* 관리자 화면 안에서 보는 작은 미리보기 영역 */}
      {previewOn && previewSeason !== 'none' && (
        <div style={{
          marginTop: 16, position: 'relative', overflow: 'hidden', height: 220, borderRadius: 12,
          border: `1px solid ${bd}`, background: '#EAF7F0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* SeasonEffect는 원래 전체 화면 기준 fixed 캔버스라, 이 좁은 미리보기 박스 안에서는
              강제로 absolute + 박스 크기만큼만 보이도록 덮어쓴다(나머지는 overflow:hidden으로 가림) */}
          <style>{`.site-settings-preview canvas{position:absolute!important;inset:0!important}`}</style>
          <div className="site-settings-preview" style={{ position: 'absolute', inset: 0 }}>
            <SeasonEffect enabled season={previewSeason} intensity={settings.seasonIntensity} />
          </div>
          <p style={{ position: 'relative', fontSize: 13, color: '#154A32', fontWeight: 700, background: 'rgba(255,255,255,.7)', padding: '6px 14px', borderRadius: 20 }}>
            {SEASON_LABEL[previewSeason]} 미리보기
          </p>
        </div>
      )}
    </div>
  )
}
