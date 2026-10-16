import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, globals) {
  const context = { exports: {}, ...globals }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}

test('notification guidance uses a stable server snapshot and detects iOS on the client', () => {
  let server = true
  let ios = true
  const context = {
    exports: {},
    require: name => {
      if (name === 'react') return {
        useSyncExternalStore: (subscribe, snapshot, serverSnapshot) => {
          assert.equal(typeof subscribe(), 'function')
          return server ? serverSnapshot() : snapshot()
        },
      }
      if (name === 'react/jsx-runtime') return { jsx: (_type, props) => props.children }
      if (name.includes('notification-settings')) return { isIOSDevice: () => ios }
      throw new Error(`Unexpected import: ${name}`)
    },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/NotificationSetupGuidance.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context)
  const guidance = context.exports.NotificationSetupGuidance
  assert.doesNotMatch(guidance({ permission: null }), /iPhone/)
  server = false
  assert.match(guidance({ permission: null }), /Safari/)
  assert.doesNotMatch(guidance({ permission: 'denied' }), /Safari/)
  ios = false
  assert.match(guidance({ permission: 'denied' }), /Android/)
})
test('notification setup guides iPhone, iPad desktop mode, denied and unsupported browsers', () => {
  const navigator = { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 1, serviceWorker: {}, standalone: false }
  const window = { isSecureContext: true, PushManager: {}, matchMedia: () => ({ matches: false }) }
  const Notification = { permission: 'default' }
  const { notificationSetupIssue } = load('../lib/notification-settings.ts', { navigator, window, Notification })
  assert.match(notificationSetupIssue(), /홈 화면/)
  navigator.userAgent = 'Macintosh'; navigator.platform = 'MacIntel'; navigator.maxTouchPoints = 5
  assert.match(notificationSetupIssue(), /홈 화면/)
  navigator.standalone = true
  assert.equal(notificationSetupIssue(), null)
  Notification.permission = 'denied'
  assert.match(notificationSetupIssue(), /차단/)
  Notification.permission = 'default'; navigator.userAgent = 'Android'; navigator.platform = 'Linux'; navigator.maxTouchPoints = 1
  assert.equal(notificationSetupIssue(), null)
  window.isSecureContext = false
  assert.match(notificationSetupIssue(), /브라우저/)
})
test('FCM requests permission before async support checks and silent registration never prompts', async () => {
  const events = []
  const Notification = { permission: 'default', requestPermission: async () => { events.push('permission'); Notification.permission = 'granted'; return 'granted' } }
  const { requestFCMToken } = load('../lib/firebase.ts', {
    process: { env: {} }, console: { log() {}, error() {} }, Notification,
    navigator: { serviceWorker: { register: async () => { events.push('worker'); return {} } } },
    require: name => name === 'firebase/app' ? { getApps: () => [{}], initializeApp: () => ({}) } : {
      isSupported: async () => { events.push('supported'); return true }, getMessaging: () => ({}),
      getToken: async () => { events.push('token'); return 'registered-token' },
    },
  })
  assert.equal(await requestFCMToken(false), null)
  assert.deepEqual(events, [])
  const pending = requestFCMToken(true)
  assert.deepEqual(events, ['permission'])
  assert.equal(await pending, 'registered-token')
  assert.deepEqual(events, ['permission', 'supported', 'worker', 'token'])
  events.length = 0
  assert.equal(await requestFCMToken(false), 'registered-token')
  assert.deepEqual(events, ['supported', 'worker', 'token'])
  events.length = 0; Notification.permission = 'denied'
  assert.equal(await requestFCMToken(true), null)
  assert.deepEqual(events, [])
})
