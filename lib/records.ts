// 학부모 의견이 있고, 관리자/선생님이 그 시점 이후로 아직 확인하지 않은 경우
// (의견을 다시 남겨 이전 확인 시점보다 최신인 경우도 포함) — 수업기록/사이드바/대시보드에서 공용으로 사용
// records.parent_comment(_at)는 record_comments의 "가장 최근 학부모 메시지"를 자동 미러링한
// 값이라(DB 트리거) 이 배지/정렬 로직들은 그대로 재사용된다.
export function isUnreadParentComment(r: {
  parent_comment: string | null
  parent_comment_at: string | null
  parent_comment_read_at: string | null
}) {
  if (!r.parent_comment || !r.parent_comment_at) return false
  if (!r.parent_comment_read_at) return true
  return new Date(r.parent_comment_read_at) < new Date(r.parent_comment_at)
}

// 수업기록 하나에 대한 학부모↔관리자·선생님 양방향 댓글 스레드의 메시지 한 건
export type RecordComment = {
  id: number
  record_id: number
  sender_type: 'parent' | 'admin'
  sender_teacher_id: string | null
  content: string
  created_at: string
  updated_at: string | null
  is_read: boolean
}

export function isUnreadRecordComment(c: { sender_type: string; is_read: boolean }) {
  return c.sender_type === 'parent' && !c.is_read
}

export function groupCommentsByRecord(comments: RecordComment[]): Record<number, RecordComment[]> {
  const map: Record<number, RecordComment[]> = {}
  for (const c of comments) {
    if (!map[c.record_id]) map[c.record_id] = []
    map[c.record_id].push(c)
  }
  return map
}
