export type Role = 'admin' | 'teacher' | 'parent'

export const can = {
  // 공지사항 — 전원 열람, 작성/수정/삭제는 admin만
  writeNotice:      (role: Role) => role === 'admin',
  readNotice:       (role: Role) => true,

  // 학원 일정 — 전원 열람, 작성/수정/삭제는 admin만
  writeSchedule:    (role: Role) => role === 'admin',
  readSchedule:     (role: Role) => true,

  // 학생 정보
  // - admin: 전체 정보(연락처 포함) 열람
  // - teacher: 이름/나이/학교만 (연락처, 학부모연락처 비표시)
  // - parent: 본인 자녀만 (별도 화면에서 처리)
  viewFullStudent:  (role: Role) => role === 'admin',
  viewBasicStudent: (role: Role) => role === 'admin' || role === 'teacher',

  // 학생 관리 메뉴 자체 접근 (등록/수정/삭제 포함) — admin만
  manageStudents:   (role: Role) => role === 'admin',

  // 반 정보 관리 — 반 추가/수정/삭제, 반에 학생 추가/제외. admin만
  manageClassInfo:  (role: Role) => role === 'admin',

  // 반 관리 메뉴 접근 — admin, teacher만 (parent는 별도 화면)
  viewClasses:      (role: Role) => role === 'admin' || role === 'teacher',

  // 수업 기록 작성/수정/삭제 — 반관리 화면 내에서 admin, teacher 모두 가능
  writeClassRecords:(role: Role) => role === 'admin' || role === 'teacher',

  // 수업기록 메뉴(문자 발송 포함) 자체 접근 — admin만, teacher는 메뉴 자체가 안 보임
  viewRecordsMenu:  (role: Role) => role === 'admin',

  // 테스트 관리 — admin, teacher 모두 전체 기능
  manageTests:      (role: Role) => role === 'admin' || role === 'teacher',

  // 통계 — admin, teacher 모두 전체 기능
  viewStats:        (role: Role) => role === 'admin' || role === 'teacher',

  // 문자 발송 — admin만 (teacher는 수업기록 메뉴 자체에 접근 불가하므로 자동으로 불가)
  sendSms:          (role: Role) => role === 'admin',

  // 선생님 계정 관리 — admin만
  manageTeachers:   (role: Role) => role === 'admin',
}

// 메뉴 항목별 접근 가능 여부 (사이드바 렌더링 및 라우트 가드용)
export const menuAccess: Record<string, (role: Role) => boolean> = {
  dashboard:  (r) => r === 'admin',
  classes:    (r) => r === 'admin' || r === 'teacher',
  students:   (r) => r === 'admin',
  records:    (r) => r === 'admin',
  tests:      (r) => r === 'admin' || r === 'teacher',
  notices:    (r) => r !== 'parent', // parent는 별도 /parent 화면에서 열람
  schedule:   (r) => r !== 'parent', // parent는 별도 /parent 화면에서 열람
  stats:      (r) => r === 'admin' || r === 'teacher',
  teachers:   (r) => r === 'admin',                    // 선생님 관리 — admin만
  attendance: (r) => r === 'admin' || r === 'teacher', // 출근부 — admin+teacher
  // 학부모 전용
  parent:     (r) => r === 'parent',
}
