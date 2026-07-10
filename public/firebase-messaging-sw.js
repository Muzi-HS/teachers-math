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

// 백그라운드 메시지 수신
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || '티처스 수학학원', {
    body: body || '새로운 수업기록이 등록됐습니다.',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: 'teachers-math-notification',
    data: payload.data,
  })
})

// 알림 클릭 시 앱으로 이동
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus()
      }
      return clients.openWindow('/parent/records')
    })
  )
})
