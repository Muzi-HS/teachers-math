import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../components/season/SeasonCanvas.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount({ width = 1440, height = 900, season = 'spring', hidden = false } = {}) {
  let effect, cleanup, now = 0, nextId = 0, sprites = 0, draws = 0, clears = 0
  const frames = new Map(), events = new Map()
  const context2d = new Proxy({}, { get: (_, key) => {
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
    if (key === 'drawImage') return () => { draws++ }
    if (key === 'clearRect') return () => { clears++ }
    return () => {}
  }, set: () => true })
  const canvas = { getContext: () => context2d }
  const document = {
    hidden, querySelector: () => null,
    createElement: () => { sprites++; return { getContext: () => context2d } },
    addEventListener: (name, cb) => events.set(name, cb),
    removeEventListener: name => events.delete(name),
  }
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 3, scrollY: 0,
    addEventListener: (name, cb) => events.set(name, cb),
    removeEventListener: name => events.delete(name), clearTimeout() {},
    setTimeout: cb => { cb(); return 1 },
  }
  const context = {
    exports: {}, document, window, performance: { now: () => now },
    requestAnimationFrame: cb => { frames.set(++nextId, cb); return nextId },
    cancelAnimationFrame: id => frames.delete(id),
    require: name => {
      if (name === 'react') return { useRef: () => ({ current: canvas }), useEffect: cb => { effect = cb } }
      if (name === 'react/jsx-runtime') return { jsx: () => null }
      return { INTENSITY_MULTIPLIER: { low: 0.5, normal: 1, high: 1.55 } }
    },
  }
  vm.runInNewContext(compiled, context)
  context.exports.default({ season, intensity: 'high' })
  cleanup = effect()
  return {
    canvas, window, events, frames,
    stats: () => ({ sprites, draws, clears }),
    tick(ms) {
      now += ms
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(cb => cb(now))
    },
    hide(value) { document.hidden = value; events.get('visibilitychange')() },
    cleanup,
  }
}

test('all seasons recycle particles without allocating more sprites during five minutes of animation', () => {
  for (const season of ['spring', 'autumn', 'winter']) {
    const app = mount({ season })
    const initial = app.stats().sprites
    for (let i = 0; i < 9000; i++) app.tick(1000 / 30)
    assert.equal(app.stats().sprites, initial)
    assert.ok(app.stats().draws > initial * 100)
    app.cleanup()
    assert.equal(app.frames.size, 0)
    assert.equal(app.events.size, 0)
  }
})

test('hidden tabs stop scheduling frames and resume with only one animation loop', () => {
  const app = mount({ hidden: true })
  assert.equal(app.frames.size, 0)
  app.hide(false)
  app.tick(20)
  const before = app.stats().draws
  app.hide(true)
  app.tick(60000)
  assert.equal(app.stats().draws, before)
  app.hide(false)
  app.hide(false)
  assert.equal(app.frames.size, 1)
  app.tick(20)
  assert.ok(app.stats().draws > before)
  app.cleanup()
})

test('mobile reduces particles and frame rate; large displays have a bounded pixel budget', () => {
  const desktop = mount(), mobile = mount({ width: 390, height: 844 })
  assert.ok(mobile.stats().sprites < desktop.stats().sprites)
  for (let i = 0; i < 120; i++) { desktop.tick(1000 / 120); mobile.tick(1000 / 120) }
  assert.ok(desktop.stats().clears >= 58 && desktop.stats().clears <= 61)
  assert.ok(mobile.stats().clears >= 29 && mobile.stats().clears <= 31)
  desktop.window.innerHeight = 800
  const count = desktop.stats().sprites
  desktop.events.get('resize')()
  assert.equal(desktop.stats().sprites, count)
  const large = mount({ width: 3840, height: 2160 })
  assert.ok(large.canvas.width * large.canvas.height <= 2_505_000)
  for (const app of [desktop, mobile, large]) app.cleanup()
})
