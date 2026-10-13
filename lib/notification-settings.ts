export function notificationSetupIssue(): string | null {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios && !standalone) return 'iPhone·iPad에서는 Safari의 공유 메뉴 → 홈 화면에 추가를 선택한 뒤, 홈 화면 아이콘으로 앱을 열고 종 버튼을 다시 눌러주세요. iOS 16.4 이상이 필요합니다.'
  if (!window.isSecureContext || typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return '이 브라우저에서는 알림을 설정할 수 없습니다. Android는 최신 Chrome에서, iPhone·iPad는 홈 화면에 추가한 앱에서 열어주세요.'
  if (Notification.permission === 'denied') return '알림이 차단되어 있습니다. 휴대폰 설정의 앱 알림 또는 브라우저의 사이트 설정에서 알림을 허용한 뒤 다시 눌러주세요.'
  return null
}
