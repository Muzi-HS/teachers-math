import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export async function requestFCMToken(): Promise<string | null> {
  try {
    const supported = await isSupported()
    console.log('[FCM] 지원 여부:', supported)
    if (!supported) return null

    const messaging = getMessaging(app)
    const permission = await Notification.requestPermission()
    console.log('[FCM] 알림 권한:', permission)
    if (permission !== 'granted') return null

    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    console.log('[FCM] SW 등록:', sw.scope)

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: sw,
    })
    console.log('[FCM] 토큰 발급:', token ? token.slice(0, 20) + '...' : 'null')
    return token || null
  } catch (e) {
    console.error('[FCM] 오류:', e)
    return null
  }
}

export async function onForegroundMessage(callback: (payload: any) => void) {
  try {
    const supported = await isSupported()
    if (!supported) return
    const messaging = getMessaging(app)
    onMessage(messaging, callback)
  } catch (e) {}
}
