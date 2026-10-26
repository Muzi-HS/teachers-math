'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Reply = { admin_reply: string | null; replied_at: string | null }
export default function AttendanceReply({ notice, canReply, onSaved }: {
  notice: { id: number; admin_reply?: string | null; replied_at?: string | null }
  canReply: boolean
  onSaved: (reply: Reply) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (saving || !draft.trim()) return
    setSaving(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('admin_reply_attendance_notice', { p_id: notice.id, p_reply: draft.trim() }).single()
      if (error || !data) throw error
      onSaved(data as Reply)
      setEditing(false)
    } catch { setError('답변을 저장하지 못했습니다. 다시 시도해주세요.') }
    finally { setSaving(false) }
  }
  return <div style={{ marginTop: 10, fontSize: 12 }}>
    <strong style={{ color: notice.admin_reply ? 'var(--ui-success)' : 'var(--ui-text-3)' }}>{notice.admin_reply ? '답변 완료' : '답변 대기'}</strong>
    {notice.admin_reply && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{notice.admin_reply}</p>}
    {notice.replied_at && <small style={{ color: 'var(--ui-text-3)' }}>{new Date(notice.replied_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>}
    {canReply && !editing && <button className="bout" style={{ marginLeft: 8 }} onClick={() => { setDraft(notice.admin_reply ?? ''); setError(''); setEditing(true) }}>{notice.admin_reply ? '답변 수정' : '답변하기'}</button>}
    {canReply && editing && <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {['확인했습니다.', '네, 조심히 오세요.', '푹 쉬고 건강한 모습으로 만나요.'].map(text => <button key={text} className="bout" disabled={saving} onClick={() => setDraft(text)}>{text}</button>)}
      </div>
      <textarea className="fi" aria-label="학부모에게 보낼 답변" placeholder="학부모님께 전달할 답변을 입력하세요" maxLength={1000} rows={2} value={draft} disabled={saving} onChange={e => setDraft(e.target.value)} />
      <p style={{ color: 'var(--ui-text-3)', margin: '6px 0' }}>저장하면 학부모 홈의 등록 내역에 표시됩니다.</p>
      <div style={{ display: 'flex', gap: 8 }}><button className="bgold" disabled={saving || !draft.trim()} onClick={() => void save()}>{saving ? '저장 중...' : '답변 저장'}</button><button className="bout" disabled={saving} onClick={() => setEditing(false)}>취소</button></div>
      {error && <p role="alert" style={{ color: 'var(--ui-danger)' }}>{error}</p>}
    </div>}
  </div>
}
