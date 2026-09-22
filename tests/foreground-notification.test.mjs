import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../components/ForegroundNotification.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

// Run the actual component's handlers with controlled React hooks and Firebase delivery.
// No live push messages, database writes, or browser permissions are needed.
function mount(pathname = '/records') {
  let state = null
  let effect
  let receiver
  let finishSubscription
  let stateWrites = 0
  let unsubscribes = 0
  let reloads = 0
  let confirmations = 0
  let accept = false
  const pushes = []
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: {
      useState: () => [state, value => { state = value; stateWrites++ }],
      useEffect: callback => { effect = callback },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ push: link => pushes.push(link) }) },
    '@/lib/firebase': {
      onForegroundMessage: callback => {
        receiver = callback
        return new Promise(resolve => { finishSubscription = resolve })
      },
    },
  }
  const context = {
    exports: {}, URL,
    require: name => { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name] },
    window: {
      location: { origin: 'https://school.example', pathname, search: '', hash: '', reload: () => { reloads++ } },
      confirm: () => { confirmations++; return accept },
    },
  }
  vm.runInNewContext(compiled, context)
  const render = () => context.exports.default()
  assert.equal(render(), null)
  const unmount = effect()
  function buttons(node = render()) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(buttons)
    return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)]
  }
  return {
    render, unmount, pushes,
    get state() { return state },
    get stateWrites() { return stateWrites },
    get unsubscribes() { return unsubscribes },
    get reloads() { return reloads },
    get confirmations() { return confirmations },
    deliver: payload => receiver(payload),
    accept: () => { accept = true },
    click: label => {
      const button = buttons().find(node => node.props.children === label)
      assert.ok(button, `Missing button: ${label}`)
      button.props.onClick()
    },
    buttonLabels: () => buttons().map(node => node.props.children),
    ready: async () => {
      finishSubscription(() => { unsubscribes++ })
      await Promise.resolve()
    },
  }
}

for (const pathname of ['/records', '/inquiries', '/parent/records', '/parent/inquiries', '/student/records']) {
  test(`receiving repeated notifications never navigates or reloads ${pathname}`, async () => {
    const app = mount(pathname)
    await app.ready()
    for (const link of [pathname, '/inquiries', '/records?date=2026-09-22']) {
      app.deliver({ data: { title: '새 글', body: '새로운 메시지입니다.', link } })
      assert.equal(app.state.body, '새로운 메시지입니다.')
      assert.equal(app.render().type, 'aside')
    }
    assert.deepEqual(app.pushes, [])
    assert.equal(app.reloads, 0)
    assert.equal(app.confirmations, 0)
    app.click('닫기')
    assert.equal(app.render(), null)
    assert.deepEqual(app.pushes, [])
    assert.equal(app.reloads, 0)
    app.unmount()
    assert.equal(app.unsubscribes, 1)
  })
}

test('cancelling the open action keeps the current page and notification', () => {
  const app = mount()
  app.deliver({ data: { link: '/inquiries' } })
  app.click('내용 확인')
  assert.equal(app.confirmations, 1)
  assert.equal(app.state.link, '/inquiries')
  assert.deepEqual(app.pushes, [])
  assert.equal(app.reloads, 0)
})

test('explicit confirmation opens another page or reloads the current page', () => {
  for (const link of ['/inquiries', '/records']) {
    const app = mount()
    app.deliver({ data: { link } })
    app.accept()
    app.click('내용 확인')
    assert.equal(app.state, null)
    assert.equal(app.reloads, link === '/records' ? 1 : 0)
    assert.deepEqual(app.pushes, link === '/records' ? [] : [link])
  }
})

test('unmount before Firebase initialization disposes late subscriptions and ignores late delivery', async () => {
  const app = mount()
  app.unmount()
  await app.ready()
  app.deliver({ data: { link: '/records' } })
  assert.equal(app.unsubscribes, 1)
  assert.equal(app.stateWrites, 0)
  assert.equal(app.reloads, 0)
})

test('notifications without an internal link remain dismissible without a navigation action', () => {
  for (const link of [undefined, 'javascript:alert(1)', '//other.example/records']) {
    const app = mount()
    app.deliver({ data: { link }, notification: { title: '알림', body: '새 소식' } })
    assert.equal(app.state.body, '새 소식')
    assert.deepEqual(app.buttonLabels(), ['닫기'])
  }
})
