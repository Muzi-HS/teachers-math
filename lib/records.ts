// 학부모 의견이 있고, 관리자/선생님이 그 시점 이후로 아직 확인하지 않은 경우
// (의견을 다시 남겨 이전 확인 시점보다 최신인 경우도 포함) — 수업기록/사이드바/대시보드에서 공용으로 사용
export function isUnreadParentComment(r: {
  parent_comment: string | null
  parent_comment_at: string | null
  parent_comment_read_at: string | null
}) {
  if (!r.parent_comment || !r.parent_comment_at) return false
  if (!r.parent_comment_read_at) return true
  return new Date(r.parent_comment_read_at) < new Date(r.parent_comment_at)
}
