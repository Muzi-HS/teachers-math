'use client'
import { useEffect, useRef } from 'react'
import type { Season, SeasonIntensity } from '@/lib/season'
import { INTENSITY_MULTIPLIER } from '@/lib/season'

type ShapeParams = { size: number; variant: number; color: string }
type SeasonConfig = {
  counts: readonly number[]
  colors: readonly string[]
  speed: readonly [number, number]
  size: readonly [number, number]
  sway: number
  rotation: number
  variants: number
  draw: (ctx: CanvasRenderingContext2D, p: ShapeParams) => void
}
type Particle = {
  x: number; y: number; speed: number; rotation: number; spin: number
  phase: number; frequency: number; sway: number; opacity: number; layer: number
  sprite: HTMLCanvasElement; half: number
}

const LAYERS = [
  { scale: 0.62, opacity: 0.55, blur: 0.8, speed: 0.62 },
  { scale: 0.88, opacity: 0.8, blur: 0.25, speed: 0.88 },
  { scale: 1.18, opacity: 1, blur: 0, speed: 1.2 },
] as const
const rand = (min: number, max: number) => min + Math.random() * (max - min)

// 곡선·음영·블러는 작은 스프라이트에 최초 한 번만 그린다.
function fillShape(ctx: CanvasRenderingContext2D, p: ShapeParams, petal = false) {
  const s = p.size
  const gradient = ctx.createLinearGradient(-s * 0.6, -s, s * 0.5, s)
  gradient.addColorStop(0, petal ? '#FFF5F8' : '#FFE2A0')
  gradient.addColorStop(0.45, p.color)
  gradient.addColorStop(1, petal ? '#D984A6' : '#A94E2C')
  ctx.fillStyle = gradient
  ctx.fill()
}

function drawPetal(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  ctx.scale(p.variant === 1 ? 0.78 : 1, 1)
  ctx.beginPath()
  ctx.moveTo(0.08 * s, 0.98 * s)
  ctx.bezierCurveTo(-0.22 * s, 0.7 * s, -0.88 * s, 0.12 * s, -0.68 * s, -0.5 * s)
  ctx.bezierCurveTo(-0.58 * s, -0.94 * s, -0.2 * s, -1.02 * s, -0.06 * s, -0.78 * s)
  ctx.quadraticCurveTo(0.02 * s, -0.63 * s, 0.07 * s, -0.78 * s)
  ctx.bezierCurveTo(0.33 * s, -1.03 * s, 0.72 * s, -0.76 * s, 0.69 * s, -0.34 * s)
  ctx.bezierCurveTo(0.69 * s, 0.22 * s, 0.36 * s, 0.76 * s, 0.08 * s, 0.98 * s)
  ctx.closePath()
  fillShape(ctx, p, true)
  ctx.strokeStyle = 'rgba(255, 249, 252, 0.55)'
  ctx.lineWidth = Math.max(0.45, s * 0.045)
  ctx.beginPath()
  ctx.moveTo(0.08 * s, 0.78 * s)
  ctx.quadraticCurveTo(-0.22 * s, 0.1 * s, -0.13 * s, -0.54 * s)
  ctx.stroke()
}

function drawVeins(ctx: CanvasRenderingContext2D, s: number, tips: readonly (readonly [number, number])[]) {
  ctx.strokeStyle = 'rgba(108, 53, 27, 0.30)'
  ctx.lineWidth = Math.max(0.45, s * 0.035)
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [x, y] of tips) {
    ctx.moveTo(0, s * 0.65)
    ctx.quadraticCurveTo(x * s * 0.35, s * (0.65 + y) * 0.35, x * s, y * s)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(125, 66, 32, 0.65)'
  ctx.lineWidth = Math.max(0.6, s * 0.065)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.65)
  ctx.quadraticCurveTo(-0.03 * s, s, 0.12 * s, 1.24 * s)
  ctx.stroke()
}

// 다섯 갈래와 작은 톱니를 명확히 표현해 작은 크기에서도 단풍잎이 보이도록 한다.
const MAPLE_OUTLINE = [
  [0, -1.1], [0.18, -0.62], [0.32, -0.73], [0.29, -0.26],
  [0.75, -0.69], [0.72, -0.33], [1.02, -0.38], [0.8, -0.03],
  [0.94, 0.09], [0.48, 0.31], [0.65, 0.48], [0.2, 0.53], [0, 0.76],
  [-0.2, 0.53], [-0.65, 0.48], [-0.48, 0.31], [-0.94, 0.09],
  [-0.8, -0.03], [-1.02, -0.38], [-0.72, -0.33], [-0.75, -0.69],
  [-0.29, -0.26], [-0.32, -0.73], [-0.18, -0.62],
] as const

function drawMaple(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  ctx.beginPath()
  MAPLE_OUTLINE.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * p.size, y * p.size)
    else ctx.lineTo(x * p.size, y * p.size)
  })
  ctx.closePath()
  fillShape(ctx, p)
  drawVeins(ctx, p.size, [[0, -0.95], [-0.69, -0.56], [0.69, -0.56], [-0.74, 0.08], [0.74, 0.08]])
}

function drawGinkgo(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  ctx.beginPath()
  ctx.moveTo(0, s * 0.78)
  ctx.bezierCurveTo(-0.22 * s, 0.33 * s, -0.85 * s, 0.08 * s, -1.03 * s, -0.47 * s)
  ctx.bezierCurveTo(-0.88 * s, -0.72 * s, -0.7 * s, -0.81 * s, -0.51 * s, -0.78 * s)
  ctx.bezierCurveTo(-0.32 * s, -0.94 * s, -0.15 * s, -0.88 * s, 0, -0.59 * s)
  ctx.bezierCurveTo(0.15 * s, -0.88 * s, 0.32 * s, -0.94 * s, 0.51 * s, -0.78 * s)
  ctx.bezierCurveTo(0.7 * s, -0.81 * s, 0.88 * s, -0.72 * s, 1.03 * s, -0.47 * s)
  ctx.bezierCurveTo(0.85 * s, 0.08 * s, 0.22 * s, 0.33 * s, 0, s * 0.78)
  ctx.closePath()
  fillShape(ctx, { ...p, color: '#E9BC49' })
  drawVeins(ctx, s, [[-0.86, -0.46], [-0.6, -0.67], [-0.3, -0.7], [0, -0.48], [0.3, -0.7], [0.6, -0.67], [0.86, -0.46]])
}

function drawOvalLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  ctx.beginPath()
  ctx.moveTo(0.14 * s, -s)
  ctx.bezierCurveTo(0.94 * s, -0.3 * s, 0.6 * s, 0.48 * s, 0, 0.8 * s)
  ctx.bezierCurveTo(-0.72 * s, 0.38 * s, -0.67 * s, -0.37 * s, 0.14 * s, -s)
  ctx.closePath()
  fillShape(ctx, p)
  drawVeins(ctx, s, [[0.12, -0.85], [-0.38, -0.26], [0.47, -0.3], [-0.35, 0.15], [0.38, 0.14]])
}

const SEASONS: Record<Exclude<Season, 'none'>, SeasonConfig> = {
  spring: {
    counts: [10, 9, 7], colors: ['#F4BCD1', '#EFA9C3', '#F8D5E2', '#EAB0C9'],
    speed: [16, 32], size: [6, 13], sway: 26, rotation: 0.6, variants: 2, draw: drawPetal,
  },
  autumn: {
    counts: [8, 8, 6], colors: ['#D88442', '#CE6948', '#DDA94A', '#BB5843'],
    speed: [24, 44], size: [8, 16], sway: 32, rotation: 0.85, variants: 3,
    draw: (ctx, p) => {
      if (p.variant === 0) drawMaple(ctx, p)
      else if (p.variant === 1) drawGinkgo(ctx, p)
      else drawOvalLeaf(ctx, p)
    },
  },
  winter: {
    counts: [16, 14, 8], colors: ['#FFFFFF'],
    speed: [12, 28], size: [2, 7], sway: 10, rotation: 0.12, variants: 1,
    draw: (ctx, p) => {
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fill()
    },
  },
}

function createParticle(cfg: SeasonConfig, layer: number, width: number, height: number): Particle {
  const depth = LAYERS[layer]
  const size = rand(...cfg.size) * depth.scale
  const half = Math.ceil(size * 1.4 + depth.blur * 3 + 2)
  const sprite = document.createElement('canvas')
  // 작은 원본만 2배 해상도로 유지. 화면 캔버스 해상도와 무관하게 윤곽은 선명하다.
  sprite.width = sprite.height = half * 4
  const ctx = sprite.getContext('2d')!
  ctx.setTransform(2, 0, 0, 2, half * 2, half * 2)
  ctx.filter = depth.blur ? `blur(${depth.blur}px)` : 'none'
  cfg.draw(ctx, { size, variant: Math.floor(rand(0, cfg.variants)), color: cfg.colors[Math.floor(rand(0, cfg.colors.length))] })
  return {
    x: rand(-40, width + 40), y: rand(-height * 0.2, height), speed: rand(...cfg.speed),
    rotation: rand(0, Math.PI * 2), spin: rand(0.2, 1) * cfg.rotation * (Math.random() < 0.5 ? -1 : 1),
    phase: rand(0, Math.PI * 2), frequency: rand(0.35, 0.8), sway: rand(cfg.sway * 0.45, cfg.sway),
    opacity: rand(0.55, 0.95) * depth.opacity, layer, sprite, half,
  }
}

export default function SeasonCanvas({ season, intensity }: { season: Exclude<Season, 'none'>; intensity: SeasonIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctx) return
    const cfg = SEASONS[season]
    const hero = document.querySelector<HTMLElement>('.lpv-hero')
    let particles: Particle[] = []
    let width = 0, height = 0, dpr = 1, mobile = false
    let heroHeight = window.innerHeight, scrollFactor = 1
    let raf = 0, resizeTimer = 0, last = 0, lastDraw = 0, elapsed = 0
    let wind = 0, targetWind = 0, nextWind = rand(2.5, 5)

    function updateScrollFactor() {
      // 스크롤 이벤트에서는 레이아웃을 읽지 않는다.
      const progress = Math.min(1, Math.max(0, window.scrollY / (heroHeight * 1.1)))
      scrollFactor = hero ? 1 - progress * 0.85 : 1
    }

    function resize() {
      const nextWidth = window.innerWidth, nextHeight = window.innerHeight
      const nextMobile = nextWidth <= 768
      // 전체 화면 픽셀 수를 제한해 고해상도 화면의 fill-rate 부하를 줄인다.
      const nextDpr = Math.min(window.devicePixelRatio || 1, nextMobile ? 1 : 1.5, Math.sqrt(2_500_000 / (nextWidth * nextHeight)))
      heroHeight = hero?.offsetHeight || nextHeight
      updateScrollFactor()
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return
      const oldWidth = width, oldHeight = height
      const rebuild = particles.length === 0 || mobile !== nextMobile
      width = nextWidth; height = nextHeight; dpr = nextDpr; mobile = nextMobile
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (rebuild) {
        particles = []
        const multiplier = INTENSITY_MULTIPLIER[intensity] * (mobile ? 0.55 : 1)
        cfg.counts.forEach((count, layer) => {
          for (let i = 0; i < Math.round(count * multiplier); i++) {
            particles.push(createParticle(cfg, layer, width, height))
          }
        })
      } else {
        for (const p of particles) {
          p.x *= width / oldWidth
          p.y *= height / oldHeight
        }
      }
    }

    function scheduleResize() {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(resize, 150)
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      // 120/144Hz 화면에서도 장식 효과는 최대 60fps. 모바일은 최대 30fps.
      const interval = 1000 / (mobile ? 30 : 60)
      const delta = now - last
      if (delta < interval - 0.5) return
      last = now - (delta >= interval ? delta % interval : 0)
      const dt = Math.min(0.05, (now - lastDraw) / 1000)
      lastDraw = now
      elapsed += dt
      if (elapsed >= nextWind) {
        targetWind = rand(-1, 1)
        nextWind = elapsed + rand(2.5, 5)
      }
      wind += (targetWind - wind) * dt * 0.6
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, width, height)
      // 이미 뒤→앞 순서로 저장되어 있으므로 한 번만 순회한다.
      for (const p of particles) {
        p.y += p.speed * LAYERS[p.layer].speed * dt
        p.x += (Math.sin(elapsed * p.frequency + p.phase) * p.sway + wind * 22) * dt
        p.rotation += p.spin * dt
        if (p.y - p.half > height + 40) {
          // 재진입 시 캔버스·그라디언트·입자 객체를 새로 만들지 않는다.
          p.y = -p.half - rand(0, 120)
          p.x = rand(-40, width + 40)
        }
        if (p.x < -60) p.x = width + 40
        if (p.x > width + 60) p.x = -40
        if (p.y + p.half < 0 || p.y - p.half > height) continue
        const flutter = season === 'winter' ? 1 : 0.72 + Math.sin(elapsed * 1.2 + p.phase) * 0.28
        const cos = Math.cos(p.rotation), sin = Math.sin(p.rotation)
        ctx!.setTransform(dpr * cos * flutter, dpr * sin * flutter, -dpr * sin, dpr * cos, dpr * p.x, dpr * p.y)
        ctx!.globalAlpha = p.opacity * scrollFactor
        ctx!.drawImage(p.sprite, -p.half, -p.half, p.half * 2, p.half * 2)
      }
    }

    function handleVisibility() {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = lastDraw = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    resize()
    handleVisibility()
    const observer = hero ? new ResizeObserver(() => {
      heroHeight = hero.offsetHeight || window.innerHeight
      updateScrollFactor()
    }) : null
    if (hero) observer?.observe(hero)
    window.addEventListener('resize', scheduleResize)
    window.addEventListener('scroll', updateScrollFactor, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleResize)
      window.removeEventListener('scroll', updateScrollFactor)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [season, intensity])

  return <canvas ref={canvasRef} aria-hidden style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }} />
}
