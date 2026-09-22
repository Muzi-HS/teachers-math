export type NoticeTargetMode = 'all' | 'selected' | 'class'
export type ClassMember = { class_id: number; student_id: number }

export function studentIdsOfClass(classMembers: ClassMember[], classId: number): number[] {
  return classMembers.filter(m => m.class_id === classId).map(m => m.student_id)
}

// 공지 저장 시 notice_target_students에 실제로 넣을 학생 id 목록을 계산한다.
// '반 전체'는 저장 시점의 반 소속 학생 전원으로 풀어서 '선택한 학생만'과 동일한 방식으로 저장하므로,
// 학부모 화면(app/parent/notices)의 student_id 기준 필터링 로직은 그대로 재사용된다.
export function resolveNoticeTargetIds(
  parentVisible: boolean,
  mode: NoticeTargetMode,
  selectedStudentIds: number[],
  classId: number | null,
  classMembers: ClassMember[],
): number[] {
  if (!parentVisible) return []
  if (mode === 'selected') return selectedStudentIds
  if (mode === 'class') return classId !== null ? studentIdsOfClass(classMembers, classId) : []
  return []
}
