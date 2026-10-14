'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StudySession, studyRemaining, studyDisplaySeconds } from '@/lib/study'
import GiantsRingDial from './GiantsRingDial'
import styles from '../Study.module.css'
import theme from './GiantsPreview.module.css'

export default function GiantsPomodoro() {
 const [session, setSession] = useState<StudySession | null>(null)
 const [goal, setGoal] = useState('')
 const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer')
 const [focus, setFocus] = useState(25), [rest, setRest] = useState(5), [rounds, setRounds] = useState(4)
 const [seconds, setSeconds] = useState(0), [message, setMessage] = useState('')
 const busy = false, loaded = true, error = ''
 const current = useRef(session)
 useEffect(() => { current.current = session }, [session])
 const act = useCallback(async (action: string, config?: { goal: string; focus: number; rest: number; rounds: number; mode: 'timer' | 'stopwatch' }) => {
  const now = Date.now(), stamp = new Date(now).toISOString()
  if (action === 'start' && config) {
   const left = config.mode === 'stopwatch' ? 86400 : config.focus * 60
   setSeconds(config.mode === 'stopwatch' ? 0 : left)
   setSession({ id: 'preview', student_id: 0, mode: config.mode, elapsed_seconds: 0, goal: config.goal, focus_minutes: config.focus, break_minutes: config.rest, rounds: config.rounds, round: 1, phase: 'focus', paused: false, remaining_seconds: left, running_since: stamp, created_at: stamp, ended_at: null, focus_seconds: 0, today_seconds: 0, week_seconds: 0, month_seconds: 0 })
   return
  }
  const value = current.current
  if (!value) return
  const left = studyRemaining(value, now)
  if (action === 'finish') { setSession(null); return }
  if (action === 'pause') {
   setSeconds(studyDisplaySeconds(value, now))
   setSession({ ...value, remaining_seconds: left, elapsed_seconds: value.mode === 'stopwatch' ? studyDisplaySeconds(value, now) : value.elapsed_seconds, running_since: null, paused: true })
  }
  if (action === 'resume') setSession({ ...value, running_since: stamp, paused: false })
  if (action === 'next') { setSeconds(value.focus_minutes * 60); setSession({ ...value, round: value.round + 1, phase: 'focus', remaining_seconds: value.focus_minutes * 60, running_since: stamp, paused: false }) }
  if (action === 'sync' && value.running_since && left === 0) {
   if (value.mode === 'stopwatch' || (value.phase === 'focus' && value.round >= value.rounds)) { setSession(null); return }
   if (value.phase === 'focus' && value.break_minutes > 0) { setSeconds(value.break_minutes * 60); setSession({ ...value, phase: 'break', remaining_seconds: value.break_minutes * 60, running_since: stamp }) }
   else { setSeconds(0); setSession({ ...value, phase: 'ready', remaining_seconds: 0, running_since: null }) }
  }
 }, [])
 useEffect(() => {
  if (!session) return
  const tick = () => { const now = Date.now(); setSeconds(studyDisplaySeconds(session, now)); if (session.running_since && studyRemaining(session, now) === 0) void act('sync') }
  const timer = window.setInterval(tick, 200)
  return () => window.clearInterval(timer)
 }, [session, act])
 const valid = goal.trim().length > 0 && (mode === 'stopwatch' || (Number.isInteger(focus) && focus >= 1 && focus <= 180 && Number.isInteger(rest) && rest >= 0 && rest <= 60 && Number.isInteger(rounds) && rounds >= 1 && rounds <= 12))
 return <div className={theme.existingTimer}>
  <section className={`${styles.card} ${theme.translucentCard}`} aria-label="집중 타이머">
   <h3 className={styles.title}>⏱ 나만의 집중 타이머</h3>
   <p className={styles.hint}>목표 하나, 집중 한 번. 오늘도 차근차근 쌓아봐요.</p>
   {!loaded ? <p className={styles.hint}>진행 중인 타이머 확인 중…</p> : !session ? <form onSubmit={e => { e.preventDefault(); setMessage(''); void act('start', { goal, focus, rest, rounds, mode }) }}>
    <div className={styles.presets} aria-label="시간 측정 방식">{(['timer','stopwatch'] as const).map(m => <button type="button" key={m} aria-pressed={mode === m} className={mode === m ? styles.primary : styles.secondary} onClick={() => setMode(m)}>{m === 'timer' ? '뽀모도로 / 타이머' : '스톱워치'}</button>)}</div>
    <GiantsRingDial seconds={mode === 'stopwatch' ? 0 : focus * 60} totalSeconds={focus * 60} stopwatch={mode === 'stopwatch'} label={mode === 'stopwatch' ? '스톱워치 · 0초부터 시작' : '타이머 · 집중을 준비해요'} />
    <label>오늘의 공부 목표<input required maxLength={120} placeholder="예: 수학 오답 10문제 다시 풀기" value={goal} onChange={e => setGoal(e.target.value)} /></label>
    {mode === 'timer' && <><div className={styles.fields}>
     <label>집중 (분)<input type="number" min={1} max={180} required value={focus} onChange={e => setFocus(Number(e.target.value))} /></label>
     <label>휴식 (분)<input type="number" min={0} max={60} required value={rest} onChange={e => setRest(Number(e.target.value))} /></label>
     <label>반복 (회)<input type="number" min={1} max={12} required value={rounds} onChange={e => setRounds(Number(e.target.value))} /></label>
    </div>
    <div className={`${styles.presets} ${theme.originalFontPresets}`}>{[[25,5,4,'기본 25 / 5'],[50,10,2,'몰입 50 / 10'],[30,0,1,'타이머 30분']].map(([f,b,r,label]) => <button type="button" className={styles.preset} key={label} onClick={() => { setFocus(Number(f)); setRest(Number(b)); setRounds(Number(r)) }}>{label}</button>)}</div>
    <p className={styles.hint}>집중 {focus * rounds}분 예정 · 집중 + 휴식이 한 회차예요. 마지막 회차는 집중 후 종료돼요.</p></>}
    {mode === 'stopwatch' && <p className={styles.hint}>0초부터 공부한 시간을 측정해요. 쉬는 동안은 일시정지를 눌러주세요. 한 기록은 최대 24시간까지 측정합니다.</p>}
    <div className={styles.actions}><button className={styles.primary} disabled={busy || !valid}>집중 시작하기</button></div>
   </form> : <>
    <GiantsRingDial seconds={seconds} totalSeconds={(session.phase === 'break' ? session.break_minutes : session.focus_minutes) * 60} stopwatch={session.mode === 'stopwatch'} resting={session.phase === 'break'} paused={session.paused} label={session.mode === 'stopwatch' ? '스톱워치 · 공부한 시간' : `${session.phase === 'focus' ? '집중 시간' : session.phase === 'break' ? '휴식 시간' : '다음 집중 준비'} · ${session.round} / ${session.rounds}회차`} />
    <p className={styles.activeGoal}>{session.goal}</p>
    <p className={styles.hint}>{session.mode === 'stopwatch' ? '체험 중인 스톱워치입니다. 쉬는 동안은 일시정지를 눌러주세요.' : '집중 후 휴식으로 전환됩니다. 휴식 후 다음 집중은 직접 시작해주세요.'}</p>
    <div className={styles.actions}>{session.phase === 'ready' ? <button className={styles.primary} disabled={busy} onClick={() => void act('next')}>다음 집중 시작</button> : <button className={styles.primary} disabled={busy} onClick={() => void act(session.paused ? 'resume' : 'pause')}>{session.paused ? '이어서 집중하기' : '일시정지'}</button>}<button className={styles.secondary} disabled={busy} onClick={() => void act('finish')}>여기까지 기록</button></div>
   </>}
   {message && <p className={styles.hint} role="status">{message}</p>}
   {error && <p role="alert" className={styles.error}>{error}</p>}
   {error && <button className={styles.secondary} disabled={busy} onClick={() => void act('sync')}>다시 연결</button>}
  </section>
  <section className={`${styles.card} ${theme.translucentCard}`}>
    <h3 className={styles.title}>나의 집중 기록</h3>
    <div className={styles.totals}>{['오늘', '이번 주', '이번 달'].map((label, i) => <div key={label} className={styles.empty}><span>{label}</span><strong>{['50분', '3시간 20분', '12시간 30분'][i]}</strong></div>)}</div>
    <p className={styles.hint}>예시 데이터 · 체험한 공부 시간은 저장되지 않습니다.</p>
  </section>
  <p className={styles.hint}>미리보기용 타이머입니다. 이 화면을 벗어나거나 새로고침하면 초기화됩니다.</p>
 </div>
}
