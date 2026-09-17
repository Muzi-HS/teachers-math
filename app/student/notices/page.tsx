'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { IconInbox } from '@/components/icons'

const navy = '#0D2A5E', bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'

type Notice = { id: number; content: string; created_at: string; className: string }

// 학생 계정 "반 공지사항" — 반관리에서 관리자/선생님이 보낸 공지를 채팅 형식으로
// 읽기만 한다(학생은 답장 불가, 일방향 소통). 여러 반에 다니면 반 이름 배지로 구분한다.
export default function StudentNotices() {
  const { student } = useAuth()
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.studentId) return
    load(student.studentId)
  }, [student?.studentId])

  async function load(studentId: number) {
    setLoading(true)
    const { data: csRows } = await supabase.from('class_students').select('class_id').eq('student_id', studentId)
    const classIds = [...new Set((csRows ?? []).map(r => r.class_id))]
    if (classIds.length === 0) { setNotices([]); setLoading(false); return }

    const [{ data: classesData }, { data: noticesData }] = await Promise.all([
      supabase.from('classes').select('id,name').in('id', classIds),
      supabase.from('class_notices').select('id,class_id,content,created_at').in('class_id', classIds).order('created_at', { ascending: true }),
    ])
    const classNames: Record<number, string> = {}
    for (const c of (classesData ?? [])) classNames[c.id] = c.name

    const merged = (noticesData ?? []).map(n => ({
      id: n.id, content: n.content, created_at: n.created_at, className: classNames[n.class_id] ?? '반',
    }))
    setNotices(merged)
    setLoading(false)
  }

  const showClassBadge = new Set(notices.map(n => n.className)).size > 1

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>반 공지사항</p>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>선생님이 보낸 공지를 확인할 수 있어요</p>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : notices.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconInbox size={28} /></p>
          <p style={{ fontSize: 14 }}>아직 받은 공지가 없습니다</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 16 }}>
          {notices.map(n => (
            <div key={n.id} style={{ marginBottom: 16 }}>
              {showClassBadge && (
                <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: navy, background: bg, padding: '2px 8px', borderRadius: 20, marginBottom: 6 }}>
                  {n.className}
                </span>
              )}
              <div style={{
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12, borderBottomLeftRadius: 3,
                background: bg, fontSize: 13.5, color: tx, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {n.content}
              </div>
              <span style={{ fontSize: 11, color: tx3, display: 'block', marginTop: 4 }}>{n.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
