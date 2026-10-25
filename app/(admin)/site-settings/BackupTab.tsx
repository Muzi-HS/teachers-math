'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { staffFetch } from '@/lib/staff-fetch'
import styles from './BackupTab.module.css'

type Run = { id: number; status: string; conclusion: string | null; createdAt: string; downloadable: boolean }
type Status = { configured: boolean; runs: Run[] }
const runLabel = (run: Run) => run.status !== 'completed'
  ? run.status === 'in_progress' ? '실행 중' : '대기 중'
  : run.conclusion === 'success' ? run.downloadable ? '완료' : '사본 없음 · Drive 확인' : run.conclusion === 'skipped' ? '예약 비활성' : run.conclusion === 'cancelled' ? '취소됨' : '실패'

export default function BackupTab() {
  const { role } = useAuth()
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await staffFetch('/api/backups')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '백업 상태를 읽지 못했습니다.')
      setStatus(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '백업 상태를 읽지 못했습니다.')
    } finally { setRefreshing(false) }
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    const timer = window.setTimeout(() => { void refresh() }, 0)
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, 30000)
    return () => { window.clearTimeout(timer); window.clearInterval(poll) }
  }, [role, refresh])

  async function download(action: 'toolkit' | 'guide' | 'download') {
    setBusy(action); setError(''); setNotice('')
    try {
      const response = await staffFetch(`/api/backups?action=${action}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '다운로드에 실패했습니다.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = action === 'guide' ? 'backup-recovery.md'
        : action === 'toolkit' ? 'teachers-math-backup-toolkit.zip' : 'teachers-math-encrypted-backup.zip'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setNotice(action === 'toolkit' ? '실행 도구를 내려받았습니다. 압축을 풀고 backup-recovery.md의 최초 설정부터 진행해 주세요.'
        : action === 'guide' ? '설정·복구 가이드를 내려받았습니다.' : '암호화된 백업 사본을 내려받았습니다. 복구하려면 별도로 보관한 개인키가 필요합니다.')
    } catch (e) { setError(e instanceof Error ? e.message : '다운로드에 실패했습니다.') }
    finally { setBusy('') }
  }

  async function startGoogle() {
    setBusy('google'); setError(''); setNotice('')
    try {
      const response = await staffFetch('/api/backups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run-google' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '실행 요청에 실패했습니다.')
      setNotice(data.message)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : '실행 요청에 실패했습니다.') }
    finally { setBusy('') }
  }

  if (role !== 'admin') return <p>승인된 관리자만 백업을 관리할 수 있습니다.</p>
  const working = status?.runs.some(r => r.status !== 'completed')
  return <section className={styles.root}>
    <div className={styles.intro}>
      <h2>데이터 백업·복구</h2>
      <p>학생·수업기록·시험·등록 이력과 첨부파일을 함께 보관합니다. 백업 파일은 암호화되며, 복구 개인키는 따로 안전하게 보관해 주세요.</p>
    </div>
    <div className={styles.notice}>
      <strong>처음에는 연결 설정이 필요합니다</strong>
      <p>아래 설정·복구 가이드에 따라 도구와 계정을 연결해 주세요. 화면의 실행 요청만으로 백업이 완료되는 것은 아닙니다.</p>
      <button disabled={!!busy} onClick={() => download('guide')}>설정·복구 가이드 다운로드</button>
    </div>
    <div className={styles.cards}>
      <article className={styles.card}>
        <span className={styles.tag}>내 PC</span><h3>로컬 백업</h3>
        <p>실행 도구로 PC에 암호화 백업을 저장합니다. Windows 작업 스케줄러로 자동 실행할 수 있습니다.</p>
        <button disabled={!!busy} onClick={() => download('toolkit')}>PC 실행 도구 다운로드</button>
        <code>Run-Backup.ps1 -Target local</code>
        <small>PC에서 실행한 결과는 실행 폴더의 last-backup.json에서 확인합니다.</small>
      </article>
      <article className={styles.card}>
        <span className={styles.tag}>PC + 동기화</span><h3>네이버 MYBOX</h3>
        <p>로컬 백업을 MYBOX 동기화 폴더에도 복사합니다. PC가 켜져 있고 MYBOX 동기화가 실행 중이어야 합니다.</p>
        <button disabled={!!busy} onClick={() => download('toolkit')}>MYBOX 실행 도구 다운로드</button>
        <code>Run-Backup.ps1 -Target mybox</code>
        <small>폴더 저장 후 MYBOX 웹에서 업로드 완료를 별도로 확인해 주세요.</small>
      </article>
      <article className={styles.card}>
        <span className={styles.tag}>PC 없이 예약 실행</span><h3>개인 Google Drive</h3>
        <p>연결 후 매일 한국 시간 새벽 3시 20분에 실행합니다. 예약은 지연될 수 있으며, 최초 설정에서 활성화해야 합니다.</p>
        <p className={styles.connection}>{status ? status.configured ? '원격 실행 연결 설정됨 · 실행 기록에서 실제 성공 여부 확인' : '원격 실행 연결 필요' : '연결 상태 확인 중'}</p>
        <button className={styles.primary} disabled={!!busy || !status?.configured || working} onClick={startGoogle}>
          {busy === 'google' ? '요청 중…' : working ? '백업 대기·실행 중' : 'Google Drive 백업 실행'}
        </button>
        <button disabled={!!busy || !status?.configured || !status.runs.some(r => r.downloadable)} onClick={() => download('download')}>최근 완료 백업을 PC로 다운로드</button>
        <small>GitHub 다운로드 사본은 30일간 보관됩니다. Drive 사본은 자동 삭제하지 않습니다.</small>
      </article>
    </div>
    {notice && <p role="status" className={styles.message}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.history}>
      <div className={styles.historyHeading}><h3>Google Drive 실행 기록</h3><button disabled={refreshing || !!busy} onClick={refresh}>{refreshing ? '확인 중…' : '상태 새로고침'}</button></div>
      <p>완료는 DB·첨부파일 백업, 암호화, Drive 업로드·검사 및 다운로드 사본 보관까지 성공한 작업입니다. 실제 복원 검증과는 별개입니다.</p>
      {status?.runs.length ? <ul>{status.runs.map(run => <li key={run.id}>
        <span>{new Date(run.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
        <strong data-result={run.conclusion}>{runLabel(run)}</strong>
      </li>)}</ul> : <p>표시할 실행 기록이 없습니다.</p>}
    </div>
    <details className={styles.help}><summary>처음 설정할 때</summary>
      <ol>
        <li>실행 도구와 가이드를 다운로드하고 Python·PostgreSQL 클라이언트·rclone·age를 설치합니다.</li>
        <li>암호화 키를 생성하고 개인키는 백업 저장소와 분리해 보관합니다.</li>
        <li>가이드에 따라 Supabase DB·Storage 연결을 설정하고 로컬 백업부터 시험합니다.</li>
        <li>MYBOX는 실제 동기화 폴더를 지정합니다. Drive는 본인 계정 인증과 백업 폴더를 설정합니다.</li>
        <li>Drive 예약 백업은 GitHub Secrets와 배포 서버 환경변수를 등록한 뒤 활성화합니다.</li>
      </ol>
    </details>
    <details className={styles.help}><summary>데이터가 사라졌을 때</summary>
      <ol>
        <li>입력·수정과 자동 백업을 잠시 중단하고, 현재 상태도 별도 백업합니다.</li>
        <li>손실 전 날짜의 백업과 복구 개인키를 확보합니다. 최신 백업에도 삭제가 반영됐을 수 있습니다.</li>
        <li>가이드의 절차대로 복호화·무결성 검사를 진행합니다.</li>
        <li>별도 Supabase 프로젝트나 격리된 DB에 복원한 뒤 학생 수·수업기록·로그인·첨부파일·권한을 확인합니다.</li>
        <li>검증 후 필요한 데이터만 복구하거나 새 프로젝트로 전환합니다. 운영 DB를 즉시 덮어쓰지 마세요.</li>
      </ol>
      <p>백업에는 배포 서버의 비밀키, Google 인증 설정, Edge Function 배포 설정이 포함되지 않습니다. 이 설정은 따로 복원해야 합니다.</p>
    </details>
  </section>
}
