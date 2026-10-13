'use client'
import { useEffect, useState } from 'react'
import { isIOSDevice } from '@/lib/notification-settings'

export function NotificationSetupGuidance({ permission }: { permission: NotificationPermission | null }) {
  const [ios, setIOS] = useState(false)
  useEffect(() => { setIOS(isIOSDevice()) }, [])
  return <>{ios
    ? permission === 'denied'
      ? 'iPhone·iPad: 설정 → 알림 → 티처스 수학학원에서 알림 허용을 켜주세요.'
      : 'iPhone·iPad: Safari 공유 → 홈 화면에 추가 후 홈 화면 앱에서 아래 알림 켜기를 눌러주세요. iOS 16.4 이상이 필요합니다.'
    : permission === 'denied'
      ? 'Android: 휴대폰 설정 → 앱 → Chrome(또는 설치한 앱) → 알림과 Chrome의 사이트 설정 → 알림에서 허용해주세요.'
      : '아래 알림 켜기를 눌러 알림을 허용해주세요.'}</>
}
