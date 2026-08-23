importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            'AIzaSyDkxrPZZjLBuHymDac8uNa4YjWgWU2tVkA',
  authDomain:        'teachers-math.firebaseapp.com',
  projectId:         'teachers-math',
  storageBucket:     'teachers-math.firebasestorage.app',
  messagingSenderId: '335273118443',
  appId:             '1:335273118443:web:3adb926b7b601e72830cae',
})

const messaging = firebase.messaging()

// data-only 메시지 수신 → 직접 알림 표시 (1번만)
messaging.onBackgroundMessage(payload => {
  const title = payload.data?.title || '티처스 수학학원'
  const body  = payload.data?.body  || '새로운 수업기록이 등록됐습니다.'
  self.registration.showNotification(title, {
    body,
    icon:  '/logo.png',
    badge: '/logo.png',
    tag:   'teachers-math-notification',  // 동일 tag면 이전 알림 교체 (중복 방지)
    data:  { link: payload.data?.link || '/parent/records' },
  })
})

// 알림 클릭 시 앱으로 이동
// 이미 열려있는 창을 포커스만 하면 페이지가 새로 마운트되지 않아 수업기록의
// 읽음 처리(useEffect에서 열람 시점에 viewed_at을 기록)가 실행되지 않는다.
// 반드시 대상 링크로 실제 이동(navigate)까지 시켜야 읽음 확인이 정상 동작한다.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification.data?.link || '/parent/records'
  const targetUrl = new URL(link, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientList => {
      const existing = clientList[0]
      if (existing) {
        if ('navigate' in existing) {
          try {
            const navigated = await existing.navigate(targetUrl)
            return (navigated || existing).focus()
          } catch {
            // navigate가 막힌 브라우저(구형 iOS 등) 대비 폴백
          }
        }
        await existing.focus()
        existing.postMessage({ type: 'push-navigate', link })
        return
      }
      return clients.openWindow(targetUrl)
    })
  )
})
