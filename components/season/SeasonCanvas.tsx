'use client'
import { useEffect, useRef } from 'react'
import type { Season, SeasonIntensity } from '@/lib/season'
import { INTENSITY_MULTIPLIER } from '@/lib/season'

type Particle = {
  x: number; y: number
  size: number; speed: number
  rot: number; rotSpeed: number
  swayAmp: number; swayFreq: number; swayPhase: number
  layer: number; color: string; shapeVariant: number; baseOpacity: number
}

type SeasonConfig = {
  countPerLayer: [number, number, number] // 뒤/중간/앞 레이어별 기본 파티클 수
  maxTotal: number
  colors: string[]
  fallSpeed: [number, number]   // px/s
  swayAmp: [number, number]     // px
  swayFreq: [number, number]    // Hz
  rotSpeed: [number, number]    // rad/s
  sizeRange: [number, number]   // px
  shapeVariants: number
  draw: (ctx: CanvasRenderingContext2D, p: Particle) => void
}

// 뒤(블러+저채도) / 중간 / 앞(선명+큼) — depth감을 위한 레이어별 스케일·투명도·블러·속도
const LAYERS = [
  { scale: 0.62, opacityMul: 0.55, blur: 2.4, speedMul: 0.62 },
  { scale: 0.88, opacityMul: 0.8, blur: 0.6, speedMul: 0.88 },
  { scale: 1.18, opacityMul: 1, blur: 0, speedMul: 1.2 },
] as const

function rand(min: number, max: number) { return min + Math.random() * (max - min) }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// 벚꽃잎 — 끝이 살짝 파인(notch) 하트형 꽃잎 실루엣. 순수 타원보다 벚꽃 특유의
// 갈라진 꽃잎 끝 느낌이 나도록 베지어 곡선 2개 + 노치로 구성한다.
function drawPetal(ctx: CanvasRenderingContext2D, p: Particle) {
  const s = p.size
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(-s * 0.95, s * 0.25, -s * 0.78, -s * 0.55, -s * 0.16, -s * 0.86)
  ctx.lineTo(0, -s * 0.6)
  ctx.lineTo(s * 0.16, -s * 0.86)
  ctx.bezierCurveTo(s * 0.78, -s * 0.55, s * 0.95, s * 0.25, 0, s)
  ctx.closePath()
  ctx.fill()
  // 중심 결(꽃잎 맥) — 아주 은은하게
  ctx.globalAlpha *= 0.3
  ctx.beginPath()
  ctx.moveTo(0, s * 0.75)
  ctx.lineTo(0, -s * 0.45)
  ctx.lineWidth = Math.max(0.4, s * 0.05)
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.stroke()
}

// 단풍잎 — 5갈래로 뾰족하게 뻗은 손바닥형 실루엣(각지고 뾰족한 잎끝 사이사이 노치).
function drawMapleLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  const s = p.size
  const segments = 16
  const startAngle = -Math.PI * 0.86, endAngle = Math.PI * 0.86 // 아래쪽 줄기 자리는 비워둠
  ctx.beginPath()
  ctx.moveTo(0, s * 1.05)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = startAngle + (endAngle - startAngle) * t - Math.PI / 2
    const wave = Math.sin(t * Math.PI * 5) // 5개의 뾰족한 갈래
    const r = s * (0.58 + Math.max(0, wave) * 0.52)
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  ctx.closePath()
  ctx.fill()
  if (s > 10) {
    ctx.globalAlpha *= 0.3
    ctx.beginPath()
    ctx.moveTo(0, s * 0.9)
    ctx.lineTo(0, -s * 0.5)
    ctx.lineWidth = Math.max(0.5, s * 0.05)
    ctx.strokeStyle = ctx.fillStyle as string
    ctx.stroke()
  }
}

// 은행잎 — 아래는 줄기로 좁아지고 위로 갈수록 부채꼴로 넓어지다 중앙이 살짝 파인 실루엣.
function drawGinkgoLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  const s = p.size
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(s * 0.15, s * 0.25, s * 0.98, -s * 0.05, s * 0.6, -s * 0.78)
  ctx.quadraticCurveTo(s * 0.28, -s * 0.56, 0, -s * 0.84)
  ctx.quadraticCurveTo(-s * 0.28, -s * 0.56, -s * 0.6, -s * 0.78)
  ctx.bezierCurveTo(-s * 0.98, -s * 0.05, -s * 0.15, s * 0.25, 0, s)
  ctx.closePath()
  ctx.fill()
}

// 작은 타원형 잎 — 위 두 종류보다 단순한 세 번째 variation
function drawRoundLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  const aspect = p.shapeVariant % 2 === 0 ? 0.5 : 0.72
  ctx.beginPath()
  ctx.ellipse(0, 0, p.size, p.size * aspect, 0, 0, Math.PI * 2)
  ctx.fill()
  if (p.size > 9) {
    ctx.globalAlpha *= 0.4
    ctx.beginPath()
    ctx.moveTo(-p.size * 0.75, 0)
    ctx.lineTo(p.size * 0.75, 0)
    ctx.lineWidth = Math.max(0.5, p.size * 0.07)
    ctx.strokeStyle = ctx.fillStyle as string
    ctx.stroke()
  }
}

// 낙엽 디스패처 — 파티클마다 배정된 shapeVariant로 단풍/은행/작은 잎을 골고루 섞는다.
function drawLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  const variant = p.shapeVariant % 3
  if (variant === 0) drawMapleLeaf(ctx, p)
  else if (variant === 1) drawGinkgoLeaf(ctx, p)
  else drawRoundLeaf(ctx, p)
}

function drawFlake(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.beginPath()
  ctx.arc(0, 0, p.size, 0, Math.PI * 2)
  ctx.fill()
}

const SEASON_CONFIG: Record<Exclude<Season, 'none'>, SeasonConfig> = {
  spring: {
    countPerLayer: [10, 9, 7], maxTotal: 70,
    colors: ['#F8DCE6', '#F3C7D6', '#FBEAEF', '#EFC0D2', '#F6D3DE'],
    fallSpeed: [16, 32], swayAmp: [12, 30], swayFreq: [.35, .8], rotSpeed: [.25, .7],
    sizeRange: [6, 13], shapeVariants: 1, draw: drawPetal,
  },
  autumn: {
    countPerLayer: [8, 8, 6], maxTotal: 55,
    colors: ['#B5651D', '#C97C3D', '#D9A441', '#A0522D', '#8B3A1D', '#C2703A'],
    fallSpeed: [24, 44], swayAmp: [16, 36], swayFreq: [.28, .65], rotSpeed: [.6, 1.7],
    sizeRange: [8, 16], shapeVariants: 3, draw: drawLeaf,
  },
  winter: {
    countPerLayer: [16, 14, 8], maxTotal: 92,
    colors: ['#FFFFFF'],
    fallSpeed: [12, 28], swayAmp: [4, 12], swayFreq: [.18, .45], rotSpeed: [0, .12],
    sizeRange: [2, 7], shapeVariants: 1, draw: drawFlake,
  },
}

function createParticle(cfg: SeasonConfig, layer: number, width: number, height: number, spawnAnywhere: boolean): Particle {
  const size = rand(cfg.sizeRange[0], cfg.sizeRange[1])
  return {
    x: rand(-40, width + 40),
    y: spawnAnywhere ? rand(-height, height) : -size - rand(0, 120),
    size,
    speed: rand(cfg.fallSpeed[0], cfg.fallSpeed[1]),
    rot: rand(0, Math.PI * 2),
    rotSpeed: rand(cfg.rotSpeed[0], cfg.rotSpeed[1]) * (Math.random() < 0.5 ? -1 : 1),
    swayAmp: rand(cfg.swayAmp[0], cfg.swayAmp[1]),
    swayFreq: rand(cfg.swayFreq[0], cfg.swayFreq[1]),
    swayPhase: rand(0, Math.PI * 2),
    layer,
    color: pick(cfg.colors),
    shapeVariant: Math.floor(Math.random() * cfg.shapeVariants),
    baseOpacity: rand(0.55, 0.95),
  }
}

export default function SeasonCanvas({ season, intensity }: { season: Exclude<Season, 'none'>; intensity: SeasonIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cfg = SEASON_CONFIG[season]
    const isMobile = window.innerWidth <= 768
    const mul = INTENSITY_MULTIPLIER[intensity] * (isMobile ? 0.55 : 1)

    let particles: Particle[] = []
    let width = 0, height = 0, dpr = 1

    function buildParticles() {
      particles = []
      for (let layer = 0; layer < 3; layer++) {
        const count = Math.min(
          Math.round(cfg.countPerLayer[layer] * mul),
          Math.round(cfg.maxTotal * mul * (cfg.countPerLayer[layer] / (cfg.countPerLayer[0] + cfg.countPerLayer[1] + cfg.countPerLayer[2]))) || 1,
        )
        for (let i = 0; i < count; i++) particles.push(createParticle(cfg, layer, width, height, true))
      }
    }

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = width + 'px'
      canvas!.style.height = height + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildParticles()
    }
    resize()
    window.addEventListener('resize', resize)

    // 바람 — 시간에 따라 목표값이 천천히 바뀌고, 실제 값은 그 목표를 부드럽게 뒤쫓는다
    const wind = { value: 0, target: 0 }

    // 히어로 높이를 넘어 스크롤할수록 옅어지되, 완전히 사라지진 않게(최소치 유지)
    const heroEl = document.querySelector('.lpv-hero') as HTMLElement | null
    let scrollFactor = 1
    function updateScrollFactor() {
      const heroHeight = heroEl?.offsetHeight ?? window.innerHeight
      const p = Math.min(1, Math.max(0, window.scrollY / (heroHeight * 1.1)))
      scrollFactor = 1 - p * 0.85 // 최저 0.15까지만 옅어짐
    }
    updateScrollFactor()
    window.addEventListener('scroll', updateScrollFactor, { passive: true })

    let raf = 0
    let last = performance.now()
    let windTimer = 0

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000) // 탭 전환 등으로 인한 급격한 점프 방지
      last = now
      windTimer += dt
      if (windTimer > rand(2.5, 5)) {
        windTimer = 0
        wind.target = rand(-1, 1)
      }
      wind.value += (wind.target - wind.value) * dt * 0.6

      ctx!.clearRect(0, 0, width, height)

      for (let layer = 0; layer < 3; layer++) {
        const L = LAYERS[layer]
        ctx!.filter = L.blur > 0 ? `blur(${L.blur}px)` : 'none'
        for (const p of particles) {
          if (p.layer !== layer) continue
          p.y += p.speed * L.speedMul * dt
          p.x += Math.sin(now / 1000 * p.swayFreq + p.swayPhase) * p.swayAmp * dt + wind.value * 22 * dt
          p.rot += p.rotSpeed * dt
          if (p.y - p.size > height + 40) {
            Object.assign(p, createParticle(cfg, layer, width, height, false))
          }
          if (p.x < -60) p.x = width + 40
          if (p.x > width + 60) p.x = -40

          ctx!.save()
          ctx!.translate(p.x, p.y)
          ctx!.rotate(p.rot)
          ctx!.scale(L.scale, L.scale)
          ctx!.globalAlpha = p.baseOpacity * L.opacityMul * scrollFactor
          ctx!.fillStyle = p.color
          cfg.draw(ctx!, p)
          ctx!.restore()
        }
      }
      ctx!.filter = 'none'

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', updateScrollFactor)
    }
  }, [season, intensity])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    />
  )
}
