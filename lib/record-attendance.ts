export type AttendanceStatus = 'on_time' | 'late' | 'absence' | 'early_leave'

export const attendanceOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'on_time', label: '정시' },
  { value: 'late', label: '지각' },
  { value: 'absence', label: '결석' },
  { value: 'early_leave', label: '조퇴' },
]

export function attendanceLabel(record: { attendance_status?: AttendanceStatus | null; late: boolean }) {
  return attendanceOptions.find(option => option.value === (record.attendance_status ?? (record.late ? 'late' : 'on_time')))?.label ?? '정시'
}
