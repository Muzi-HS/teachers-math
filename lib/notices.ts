export type NoticeTargetMode = 'all' | 'selected'
export type ClassMember = { class_id: number; student_id: number }

export function studentIdsOfClass(classMembers: ClassMember[], classId: number): number[] {
  return classMembers.filter(m => m.class_id === classId).map(m => m.student_id)
}

// 공지 저장 시 notice_target_students에 실제로 넣을 학생 id 목록을 계산한다.
// '반으로 빠르게 선택'은 UI에서 선택한 학생만 모드의 target_student_ids에
// 미리 풀어 넣어주는 것일 뿐, 저장 시점에는 selected 모드와 동일하게 처리된다.
export function resolveNoticeTargetIds(mode: NoticeTargetMode, selectedStudentIds: number[]): number[] {
  return mode === 'selected' ? selectedStudentIds : []
}
