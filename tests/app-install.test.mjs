import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount({ ios = false, standalone = false } = {}) {
  const values = [], refs = [], events = new Map()
  let stateIndex, refIndex, effect, contextValue
  const context = {
    exports: {},
    navigator: { userAgent: ios ? 'iPhone' : 'Chrome', platform: '', maxTouchPoints: 0 },
    window: {
      matchMedia: () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }),
      addEventListener: (name, cb) => events.set(name, cb),
      removeEventListener: name => events.delete(name),
    },
    require: name => name === 'react/jsx-runtime' ? { jsx: (_, props) => { contextValue = props.value } } : {
      createContext: () => ({ Provider: 'provider' }), useContext: () => contextValue,
      useEffect: cb => { effect = cb },
      useRef: value => { const i = refIndex++; return refs[i] ??= { current: value } },
      useState: initial => { const i = stateIndex++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value }] },
    },
  }
  vm.runInNewContext(compile('../context/AppInstallContext.tsx'), context)
  const render = () => { stateIndex = refIndex = 0; context.exports.AppInstallProvider({ children: null }); return contextValue }
  render()
  const cleanup = effect()
  return { render, events, cleanup }
}

test('installation event survives navigation renders and is consumed only once', async () => {
  const app = mount()
  let prompts = 0, prevented = false
  app.events.get('beforeinstallprompt')({ preventDefault() { prevented = true }, prompt: async () => { prompts++ }, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
  assert.equal(prevented, true)
  app.render()
  await app.render().install()
  await app.render().install()
  assert.equal(prompts, 1)
  assert.equal(app.render().installing, false)
  app.cleanup()
  assert.equal(app.events.size, 0)
})

test('iOS fallback, failed prompts, and successful installation expose usable state', async () => {
  const ios = mount({ ios: true })
  await ios.render().install()
  assert.match(ios.render().message, /Safari.*홈 화면에 추가/)
  const app = mount()
  app.events.get('beforeinstallprompt')({ preventDefault() {}, prompt: async () => { throw Error('unavailable') } })
  await app.render().install()
  assert.equal(app.render().installing, false)
  assert.match(app.render().message, /열지 못했습니다/)
  app.events.get('appinstalled')()
  assert.equal(app.render().installed, true)
  assert.equal(mount({ standalone: true }).render().installed, true)
})

test('installation menu is available to all staff, but not parents or students', () => {
  const context = { exports: {} }
  vm.runInNewContext(compile('../lib/permissions.ts'), context)
  for (const role of ['admin', 'teacher', 'assistant']) assert.equal(context.exports.menuAccess['app-qr'](role), true)
  for (const role of ['parent', 'student']) assert.equal(context.exports.menuAccess['app-qr'](role), false)
})
