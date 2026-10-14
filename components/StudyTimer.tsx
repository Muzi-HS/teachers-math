'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { StudySession, studyRemaining, studyDisplaySeconds } from '@/lib/study'
import StudyRecords from './StudyRecords'
import StudyDial from './StudyDial'
import GiantsRingDial from './student-preview/GiantsRingDial'
import { useStudentTheme } from '@/context/StudentThemeContext'
import styles from './Study.module.css'

export default function StudyTimer() {
 const { theme } = useStudentTheme()
 const Dial = theme === 'green' ? StudyDial : GiantsRingDial
 const { student } = useAuth()
 const token = student?.sessionToken
 const [session, setSession] = useState<StudySession | null>(null)
 const [goal, setGoal] = useState('')
 const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer')
 const [focus, setFocus] = useState(25), [rest, setRest] = useState(5), [rounds, setRounds] = useState(4)
 const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('')
 const [seconds, setSeconds] = useState(0), [refresh, setRefresh] = useState(0), [message, setMessage] = useState('')
 const offset = useRef(0), pending = useRef(false), liveToken = useRef(token)
 useEffect(() => { liveToken.current = token }, [token])
 const act = useCallback(async (action: string, config?: { goal: string; focus: number; rest: number; rounds: number; mode: 'timer' | 'stopwatch' }) => {
  if (!token || pending.current) return
  pending.current = true; setBusy(true); setError('')
  try {
   const { data, error } = await supabase.rpc('study_timer', { p_token: token, p_action: action, ...(config ? { p_goal: config.goal, p_focus: config.focus, p_break: config.rest, p_rounds: config.rounds, p_mode: config.mode } : {}) })
   if (token !== liveToken.current) return
   if (error) { setError('타이머를 연결하지 못했습니다. 다시 연결을 눌러주세요. 계속 실패하면 선생님에게 문의해주세요.'); return }
   offset.current = new Date(data.server_now).getTime() - Date.now()
   setSession(data.session); setLoaded(true); setRefresh(v => v + 1)
   if (action === 'finish' || data.completed) setMessage('오늘의 집중을 기록했어요. 수고했어요!')
  } catch { setError('연결이 끊겼습니다. 다시 연결해주세요.') }
  finally { pending.current = false; setBusy(false) }
 }, [token])
 useEffect(() => { const t = setTimeout(() => { setLoaded(false); setSession(null); void act('sync') }, 0); return () => clearTimeout(t) }, [act])
 useEffect(() => {
  function tick() {
   if (!session) return
   const now = Date.now() + offset.current
   const left = studyRemaining(session, now)
   setSeconds(studyDisplaySeconds(session, now))
   if (left === 0 && session.running_since && !error) void act('sync')
  }
  tick(); const t = setInterval(tick, 1000)
  const sync = () => { if (document.visibilityState === 'visible') { tick(); void act('sync') } }
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('pageshow', sync)
  window.addEventListener('focus', sync)
  window.addEventListener('online', sync)
  const poll = setInterval(() => { if (document.visibilityState === 'visible' && !error) void act('sync') }, 30000)
  return () => { clearInterval(t); clearInterval(poll); document.removeEventListener('visibilitychange', sync); window.removeEventListener('pageshow', sync); window.removeEventListener('focus', sync); window.removeEventListener('online', sync) }
 }, [session, act, error])
 if (!student || !token) return null
 const valid = goal.trim().length > 0 && (mode === 'stopwatch' || (Number.isInteger(focus) && focus >= 1 && focus <= 180 && Number.isInteger(rest) && rest >= 0 && rest <= 60 && Number.isInteger(rounds) && rounds >= 1 && rounds <= 12))
 return <>
  <section className={styles.card} aria-label="집중 타이머">
   <h3 className={styles.title}>⏱ 나만의 집중 타이머</h3>
   <p className={styles.hint}>목표 하나, 집중 한 번. 오늘도 차근차근 쌓아봐요.</p>
   <p className={styles.hint}>알림을 허용하면 집중·휴식 종료 시 푸시 알림을 받을 수 있어요.</p>
   {!loaded ? <p className={styles.hint}>진행 중인 타이머 확인 중…</p> : !session ? <form onSubmit={e => { e.preventDefault(); setMessage(''); void act('start', { goal, focus, rest, rounds, mode }) }}>
    <div className={styles.presets} aria-label="시간 측정 방식">{(['timer','stopwatch'] as const).map(m => <button type="button" key={m} aria-pressed={mode === m} className={mode === m ? styles.primary : styles.secondary} onClick={() => setMode(m)}>{m === 'timer' ? '뽀모도로 / 타이머' : '스톱워치'}</button>)}</div>
    <Dial seconds={mode === 'stopwatch' ? 0 : focus * 60} totalSeconds={focus * 60} stopwatch={mode === 'stopwatch'} label={mode === 'stopwatch' ? '스톱워치 · 0초부터 시작' : '타이머 · 집중을 준비해요'} />
    <label>오늘의 공부 목표<input required maxLength={120} placeholder="예: 수학 오답 10문제 다시 풀기" value={goal} onChange={e => setGoal(e.target.value)} /></label>
    {mode === 'timer' && <><div className={styles.fields}>
     <label>집중 (분)<input type="number" min={1} max={180} required value={focus} onChange={e => setFocus(Number(e.target.value))} /></label>
     <label>휴식 (분)<input type="number" min={0} max={60} required value={rest} onChange={e => setRest(Number(e.target.value))} /></label>
     <label>반복 (회)<input type="number" min={1} max={12} required value={rounds} onChange={e => setRounds(Number(e.target.value))} /></label>
    </div>
    <div className={styles.presets}>{[[25,5,4,'기본 25 / 5'],[50,10,2,'몰입 50 / 10'],[30,0,1,'타이머 30분']].map(([f,b,r,label]) => <button type="button" className={styles.preset} key={label} onClick={() => { setFocus(Number(f)); setRest(Number(b)); setRounds(Number(r)) }}>{label}</button>)}</div>
    <p className={styles.hint}>집중 {focus * rounds}분 예정 · 집중 + 휴식이 한 회차예요. 마지막 회차는 집중 후 종료돼요.</p></>}
    {mode === 'stopwatch' && <p className={styles.hint}>0초부터 공부한 시간을 측정해요. 쉬는 동안은 일시정지를 눌러주세요. 한 기록은 최대 24시간까지 측정합니다.</p>}
    <div className={styles.actions}><button className={styles.primary} disabled={busy || !valid}>집중 시작하기</button></div>
   </form> : <>
    <Dial seconds={seconds} totalSeconds={(session.phase === 'break' ? session.break_minutes : session.focus_minutes) * 60} resting={session.phase === 'break'} stopwatch={session.mode === 'stopwatch'} paused={session.paused} label={session.mode === 'stopwatch' ? '스톱워치 · 공부한 시간' : `${session.phase === 'focus' ? '집중 시간' : session.phase === 'break' ? '휴식 시간' : '다음 집중 준비'} · ${session.round} / ${session.rounds}회차`} />
    <p className={styles.activeGoal}>{session.goal}</p>
    <p className={styles.hint}>{session.mode === 'stopwatch' ? '화면을 꺼도 시간은 이어집니다. 다시 열면 경과 시간을 복원해요. 최대 24시간 후 자동 종료됩니다.' : '화면을 꺼도 현재 집중·휴식 시간은 이어집니다. 휴식 후 다음 집중은 직접 시작해주세요.'}</p>
    <div className={styles.actions}>{session.phase === 'ready' ? <button className={styles.primary} disabled={busy} onClick={() => void act('next')}>다음 집중 시작</button> : <button className={styles.primary} disabled={busy} onClick={() => void act(session.paused ? 'resume' : 'pause')}>{session.paused ? '이어서 집중하기' : '일시정지'}</button>}<button className={styles.secondary} disabled={busy} onClick={() => void act('finish')}>여기까지 기록</button></div>
   </>}
   {message && <p className={styles.hint} role="status">{message}</p>}
   {error && <p role="alert" className={styles.error}>{error}</p>}
   {error && <button className={styles.secondary} disabled={busy} onClick={() => void act('sync')}>다시 연결</button>}
  </section>
  <StudyRecords token={token} studentId={student.studentId} refresh={refresh} />
 </>
}
