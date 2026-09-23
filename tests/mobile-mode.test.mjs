import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../context/MobileModeContext.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount({ width = 1440, coarse = false, saved = null, blocked = false, server = false } = {}) {
  let state = false, effect, subscribe, snapshot, serverSnapshot
  const listeners = new Set()
  const matches = query => query.split(',').some(part => {
    const max = Number(part.match(/max-width:\s*(\d+)px/)[1])
    return width <= max && (!part.includes('pointer: coarse') || coarse)
  })
  const jsx = (type, props) => ({ type, props })
  const context = {
    exports: {},
    localStorage: {
      getItem: () => { if (blocked) throw Error('blocked'); return saved },
      setItem: (_, value) => { if (blocked) throw Error('blocked'); saved = value },
    },
    require: name => name === 'react/jsx-runtime' ? { jsx } : {
      createContext: () => ({ Provider: 'provider' }),
      useState: () => [state, value => { state = value }],
      useEffect: callback => { effect = callback },
      useSyncExternalStore: (sub, get, ssr) => {
        subscribe = sub; snapshot = get; serverSnapshot = ssr
        return server ? ssr() : get()
      },
    },
  }
  if (!server) context.window = { matchMedia: query => ({
    matches: matches(query),
    addEventListener: (_, callback) => listeners.add(callback),
    removeEventListener: (_, callback) => listeners.delete(callback),
  }) }
  vm.runInNewContext(compiled, context)
  const render = () => context.exports.MobileModeProvider({ children: null }).props.value
  render()
  if (!server) effect()
  return {
    render, listeners,
    listen: callback => subscribe(callback),
    resize: (nextWidth, touch = coarse) => { width = nextWidth; coarse = touch; for (const callback of listeners) callback() },
    snapshot: () => snapshot(), serverSnapshot: () => serverSnapshot(),
  }
}

test('phone and touch landscape use mobile layout despite a saved PC preference', () => {
  for (const [width, coarse] of [[390, true], [844, true], [1024, true], [900, false]]) {
    const app = mount({ width, coarse, saved: '0' })
    assert.equal(app.render().mobileMode, true)
    app.render().setMobileMode(false)
    assert.equal(app.render().mobileMode, true)
  }
})

test('desktop supports preview and returns to desktop without disabling automatic mobile layout', () => {
  const app = mount({ saved: '1' })
  assert.equal(app.render().isMobileScreen, false)
  assert.equal(app.render().mobileMode, true)
  app.render().setMobileMode(false)
  assert.equal(app.render().mobileMode, false)
  app.resize(390, true)
  assert.equal(app.render().mobileMode, true)
  app.resize(1440, false)
  assert.equal(app.render().mobileMode, false)
})

test('screen changes notify subscribers and cleanup removes the listener', () => {
  const app = mount()
  let notifications = 0
  const dispose = app.listen(() => { notifications++ })
  app.resize(768)
  assert.equal(notifications, 1)
  assert.equal(app.snapshot(), true)
  dispose()
  assert.equal(app.listeners.size, 0)
})

test('blocked storage and server rendering do not prevent a usable layout', () => {
  const app = mount({ width: 390, blocked: true })
  app.render().setMobileMode(false)
  assert.equal(app.render().mobileMode, true)
  const ssr = mount({ server: true })
  assert.equal(ssr.render().mobileMode, true)
  assert.equal(ssr.serverSnapshot(), true)
})
