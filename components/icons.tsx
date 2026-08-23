// 공용 라인 아이콘 세트 — 사이드바 메뉴와 동일한 스타일(stroke 기반)로 통일.
// 이모지 아이콘은 사용하지 않고, 아이콘이 필요한 곳은 이 파일의 컴포넌트를 사용한다.
type IconProps = { size?: number; color?: string; strokeWidth?: number }

// 공지사항(사이드바)과 동일한 모양 — 공지/알림 용도로 재사용
export function IconBell({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

// 학원일정(사이드바)과 동일한 모양 — 날짜/일정 용도로 재사용
export function IconCalendar({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

// 문의하기(사이드바)와 동일한 모양 — 채팅/문의 용도로 재사용
export function IconChat({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  )
}

// 테스트(사이드바)와 동일한 모양 — 시험/목록 용도로 재사용
export function IconClipboard({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

// 통계(사이드바)와 동일한 모양 — 막대그래프 용도로 재사용
export function IconBarChart({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  )
}

// 학생관리(사이드바)와 동일한 모양 — 학생/사람 용도로 재사용
export function IconUsers({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

export function IconBook({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  )
}

export function IconPencil({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function IconTrash({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" /><path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function IconCheck({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 5-5" />
    </svg>
  )
}

export function IconClock({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function IconLock({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  )
}

export function IconPin({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M12 17v5" /><path d="M8 3h8l-1 7 3 3H6l3-3-1-7z" />
    </svg>
  )
}

export function IconTrophy({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" /><path d="M7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3" />
    </svg>
  )
}

export function IconLightbulb({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.6 10.8c.5.4.85 1.05.85 1.7v.5h5.5v-.5c0-.65.35-1.3.85-1.7A6 6 0 0012 3z" />
    </svg>
  )
}

export function IconX({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function IconSend({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

export function IconSave({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}

export function IconInbox({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  )
}

export function IconArrowLeft({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function IconArrowUp({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function IconSmartphone({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" />
    </svg>
  )
}

export function IconShare({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
      <path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  )
}
