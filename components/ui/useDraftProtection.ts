'use client'

import { useEffect, useRef, useState } from 'react'
import { UNSAVED_CHECK_EVENT } from '@/lib/unsaved-changes'

// 탭 내에서 계정·날짜·대상별로 보관한다. 서버 공개나 발송은 하지 않는다.
export function useDraftProtection<T>(key: string, value: T, enabled: boolean, busy = false) {
  const serialized = JSON.stringify(value)
  const baseline = useRef<{ key: string; value: string } | null>(null)
  const latest = useRef({ key, serialized, enabled, busy })
  latest.current = { key, serialized, enabled, busy }
  const [recoverable, setRecoverable] = useState<T | null>(null)
  const [status, setStatus] = useState('')
  const dirty = enabled && baseline.current?.key === key && baseline.current.value !== serialized

  function persist() {
    const current = latest.current
    if (!current.enabled || baseline.current?.key !== current.key || baseline.current.value === current.serialized) return true
    try {
      sessionStorage.setItem(current.key, JSON.stringify({ version: 1, savedAt: Date.now(), value: JSON.parse(current.serialized) }))
      setStatus('이 탭에 임시저장됨 · 학부모에게 공개되지 않습니다.')
      return true
    } catch {
      setStatus('기기 임시저장을 사용할 수 없습니다. 닫기 전에 저장해주세요.')
      return false
    }
  }

  function confirmLeave() {
    const current = latest.current
    if (current.busy) { window.alert('저장 중입니다. 완료 후 이동해주세요.'); return false }
    if (!current.enabled || baseline.current?.key !== current.key || baseline.current.value === current.serialized) return true
    const saved = persist()
    return window.confirm(saved
      ? '저장하지 않은 변경 내용이 있습니다. 이 탭에 임시저장하고 나갈까요?'
      : '임시저장에 실패했습니다. 나가면 작성 내용을 잃을 수 있습니다. 나갈까요?')
  }

  function markSaved(savedValue: T = value) {
    baseline.current = { key, value: JSON.stringify(savedValue) }
    try { sessionStorage.removeItem(key) } catch {}
    setRecoverable(null)
    setStatus('저장 완료')
  }

  function discardRecovery() {
    try { sessionStorage.removeItem(key) } catch {}
    setRecoverable(null)
    setStatus('')
  }

  useEffect(() => {
    if (!enabled) return
    if (baseline.current?.key !== key) {
      baseline.current = { key, value: serialized }
      setRecoverable(null)
      setStatus('')
      try {
        const draft = JSON.parse(sessionStorage.getItem(key) || 'null')
        if (draft?.version === 1 && draft.value && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          setRecoverable(draft.value)
        } else if (draft) sessionStorage.removeItem(key)
      } catch {}
      return
    }
    if (baseline.current.value === serialized || recoverable) return
    const timer = setTimeout(persist, 350)
    return () => clearTimeout(timer)
    // The snapshot is serialized so object identity never restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, serialized, recoverable])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = latest.current
      if (current.busy || (current.enabled && baseline.current?.key === current.key && baseline.current.value !== current.serialized)) {
        persist()
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const check = (event: Event) => { if (!event.defaultPrevented && !confirmLeave()) event.preventDefault() }
    const flush = () => { persist() }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', flush)
    window.addEventListener(UNSAVED_CHECK_EVENT, check)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      flush()
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener(UNSAVED_CHECK_EVENT, check)
      document.removeEventListener('visibilitychange', visibility)
    }
    // Handlers use latest.current to include the last keystroke on exit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { dirty, recoverable, status, persist, confirmLeave, markSaved, discardRecovery,
    restore: () => { const result = recoverable; setRecoverable(null); setStatus(' 임시저장 내용을 복구했습니다. 확인 후 저장해주세요.'); return result } }
}
