'use client'
import { useEffect, useRef } from 'react'
import type { Season, SeasonIntensity } from '@/lib/season'
import { INTENSITY_MULTIPLIER } from '@/lib/season'

// 성능 최적화 핵심: 예전에는 매 프레임마다 파티클 하나하나를 벡터로 다시 그리면서
// 뒤/중간 레이어에는 ctx.filter = blur(...)까지 실시간으로 적용했는데, 캔버스의 실시간
// 블러 필터는 매우 무겁고(픽셀당 연산) 파티클 수만큼 곱해져서 체감 렉의 주 원인이었다.
// 지금은 파티클이 생성될 때(또는 화면 밖으로 나가 재생성될 때) "생김새 + 블러"를 작은
// 오프스크린 캔버스에 딱 한 번만 그려서 스프라이트로 저장해두고, 매 프레임에는 그 스프라이트를
// drawImage로 붙여넣기만 한다 — 회전/이동만 매 프레임 갱신되고 실제 그리기(도형·블러)는
// 파티클 수명 동안 한 번만 계산된다.
type SpriteParticle = {
  x: number; y: number
  speed: number
  rot: number; rotSpeed: number
  swayAmp: number; swayFreq: number; swayPhase: number
  layer: number
  baseOpacity: number
  sprite: HTMLCanvasElement
  halfW: number; halfH: number // 스프라이트를 그릴 절반 크기(CSS px)
}

type ShapeParams = { size: number; shapeVariant: number }

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
  extent: number                 // 도형이 중심에서 최대 얼마나 뻗어나가는지(스프라이트 크기 계산용)
  draw: (ctx: CanvasRenderingContext2D, p: ShapeParams) => void
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
function drawPetal(ctx: CanvasRenderingContext2D, p: ShapeParams) {
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

// 잎자루(줄기) — 낙엽 종류 공통으로 아래쪽에 짧은 줄기를 그려 자연스러움을 더한다.
function drawStem(ctx: CanvasRenderingContext2D, s: number, baseY: number) {
  ctx.globalAlpha *= 0.35
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(0, baseY + s * 0.22)
  ctx.lineWidth = Math.max(0.5, s * 0.07)
  ctx.lineCap = 'round'
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.stroke()
}

// 단풍잎 — 5갈래로 뾰족하게 뻗은 손바닥형 실루엣(각지고 뾰족한 잎끝 사이사이 노치).
// 잎맥이 중심에서 각 갈래 끝까지 5방향으로 뻗어나가 단풍잎 특유의 결이 보이게 한다.
function drawMapleLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  const segments = 16
  const startAngle = -Math.PI * 0.86, endAngle = Math.PI * 0.86 // 아래쪽 줄기 자리는 비워둠
  const lobeAngleOf = (t: number) => startAngle + (endAngle - startAngle) * t - Math.PI / 2
  ctx.beginPath()
  ctx.moveTo(0, s * 1.05)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = lobeAngleOf(t)
    const wave = Math.sin(t * Math.PI * 5) // 5개의 뾰족한 갈래
    const r = s * (0.58 + Math.max(0, wave) * 0.52)
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  ctx.closePath()
  ctx.fill()
  if (s > 9) {
    const veinAlpha = ctx.globalAlpha
    ctx.lineWidth = Math.max(0.4, s * 0.045)
    ctx.strokeStyle = ctx.fillStyle as string
    // 5개 갈래 끝(파형의 피크, t≈0.1/0.3/0.5/0.7/0.9)까지 뻗는 잎맥
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const angle = lobeAngleOf(t)
      const r = s * 1.10
      ctx.globalAlpha = veinAlpha * (t === 0.5 ? 0.32 : 0.22)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95)
      ctx.stroke()
    }
    ctx.globalAlpha = veinAlpha
    drawStem(ctx, s, s * 1.05)
  }
}

// 은행잎 — 아래는 줄기로 좁아지고 위로 갈수록 부채꼴로 넓어지다 중앙이 살짝 파인 실루엣.
// 은행잎 특유의 밑동에서 위로 부챗살처럼 퍼지는 평행 잎맥을 살짝 넣는다.
function drawGinkgoLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(s * 0.15, s * 0.25, s * 0.98, -s * 0.05, s * 0.6, -s * 0.78)
  ctx.quadraticCurveTo(s * 0.28, -s * 0.56, 0, -s * 0.84)
  ctx.quadraticCurveTo(-s * 0.28, -s * 0.56, -s * 0.6, -s * 0.78)
  ctx.bezierCurveTo(-s * 0.98, -s * 0.05, -s * 0.15, s * 0.25, 0, s)
  ctx.closePath()
  ctx.fill()
  if (s > 9) {
    const veinAlpha = ctx.globalAlpha
    ctx.lineWidth = Math.max(0.4, s * 0.04)
    ctx.strokeStyle = ctx.fillStyle as string
    ctx.globalAlpha = veinAlpha * 0.28
    for (const [ex, ey] of [[-0.45, -0.68], [0, -0.83], [0.45, -0.68]] as const) {
      ctx.beginPath()
      ctx.moveTo(0, s * 0.85)
      ctx.lineTo(s * ex, s * ey)
      ctx.stroke()
    }
    ctx.globalAlpha = veinAlpha
    drawStem(ctx, s, s)
  }
}

// 작은 타원형 잎 — 매끈한 타원 실루엣의 세 번째 variation
function drawRoundLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
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
    drawStem(ctx, p.size, p.size * aspect)
  }
}

// 톱니 잎(자작나무/너도밤나무형) — 가장자리가 잘게 들쭉날쭉한 타원형, 네 번째 variation
function drawSerratedLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const s = p.size
  const rx = s, ry = s * 0.56
  const teeth = 11
  ctx.beginPath()
  for (let i = 0; i <= teeth * 2; i++) {
    const t = i / (teeth * 2)
    const angle = t * Math.PI * 2 - Math.PI / 2
    const jag = i % 2 === 0 ? 1 : 0.87
    const x = Math.cos(angle) * rx * jag
    const y = Math.sin(angle) * ry * jag
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  if (s > 9) {
    ctx.globalAlpha *= 0.3
    ctx.beginPath()
    ctx.moveTo(0, -ry * 0.85)
    ctx.lineTo(0, ry * 0.85)
    ctx.lineWidth = Math.max(0.4, s * 0.045)
    ctx.strokeStyle = ctx.fillStyle as string
    ctx.stroke()
    drawStem(ctx, s, ry)
  }
}

// 낙엽 디스패처 — 파티클마다 배정된 shapeVariant로 단풍/은행/작은 잎/톱니 잎을 골고루 섞는다.
function drawLeaf(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  const variant = p.shapeVariant % 4
  if (variant === 0) drawMapleLeaf(ctx, p)
  else if (variant === 1) drawGinkgoLeaf(ctx, p)
  else if (variant === 2) drawRoundLeaf(ctx, p)
  else drawSerratedLeaf(ctx, p)
}

function drawFlake(ctx: CanvasRenderingContext2D, p: ShapeParams) {
  ctx.beginPath()
  ctx.arc(0, 0, p.size, 0, Math.PI * 2)
  ctx.fill()
}

const SEASON_CONFIG: Record<Exclude<Season, 'none'>, SeasonConfig> = {
  spring: {
    countPerLayer: [10, 9, 7], maxTotal: 70,
    colors: ['#F8DCE6', '#F3C7D6', '#FBEAEF', '#EFC0D2', '#F6D3DE'],
    fallSpeed: [16, 32], swayAmp: [12, 30], swayFreq: [.35, .8], rotSpeed: [.25, .7],
    sizeRange: [6, 13], shapeVariants: 1, extent: 0.95, draw: drawPetal,
  },
  autumn: {
    countPerLayer: [8, 8, 6], maxTotal: 55,
    colors: ['#B5651D', '#C97C3D', '#D9A441', '#A0522D', '#8B3A1D', '#C2703A'],
    fallSpeed: [24, 44], swayAmp: [16, 36], swayFreq: [.28, .65], rotSpeed: [.6, 1.7],
    sizeRange: [8, 16], shapeVariants: 4, extent: 1.35, draw: drawLeaf,
  },
  winter: {
    countPerLayer: [16, 14, 8], maxTotal: 92,
    colors: ['#FFFFFF'],
    fallSpeed: [12, 28], swayAmp: [4, 12], swayFreq: [.18, .45], rotSpeed: [0, .12],
    sizeRange: [2, 7], shapeVariants: 1, extent: 1, draw: drawFlake,
  },
}

// 파티클 생김새(도형+블러)를 작은 오프스크린 캔버스에 한 번만 렌더링해 스프라이트로 만든다.
function makeSprite(cfg: SeasonConfig, layer: number, size: number, color: string, shapeVariant: number, dpr: number) {
  const L = LAYERS[layer]
  const effSize = size * L.scale
  const blurPx = L.blur
  const half = Math.ceil(effSize * cfg.extent + blurPx * 3 + 2)

  const sprite = document.createElement('canvas')
  sprite.width = half * 2 * dpr
  sprite.height = half * 2 * dpr
  const sctx = sprite.getContext('2d')!
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  sctx.translate(half, half)
  sctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'
  sctx.fillStyle = color
  sctx.globalAlpha = 1
  cfg.draw(sctx, { size: effSize, shapeVariant })

  return { sprite, half }
}

type Particle = SpriteParticle

function createParticle(cfg: SeasonConfig, layer: number, width: number, height: number, spawnAnywhere: boolean, dpr: number): Particle {
  const size = rand(cfg.sizeRange[0], cfg.sizeRange[1])
  const color = pick(cfg.colors)
  const shapeVariant = Math.floor(Math.random() * cfg.shapeVariants)
  const { sprite, half } = makeSprite(cfg, layer, size, color, shapeVariant, dpr)
  return {
    x: rand(-40, width + 40),
    y: spawnAnywhere ? rand(-height, height) : -half - rand(0, 120),
    speed: rand(cfg.fallSpeed[0], cfg.fallSpeed[1]),
    rot: rand(0, Math.PI * 2),
    rotSpeed: rand(cfg.rotSpeed[0], cfg.rotSpeed[1]) * (Math.random() < 0.5 ? -1 : 1),
    swayAmp: rand(cfg.swayAmp[0], cfg.swayAmp[1]),
    swayFreq: rand(cfg.swayFreq[0], cfg.swayFreq[1]),
    swayPhase: rand(0, Math.PI * 2),
    layer,
    baseOpacity: rand(0.55, 0.95),
    sprite, halfW: half, halfH: half,
  }
}

export default function SeasonCanvas({ season, intensity }: { season: Exclude<Season, 'none'>; intensity: SeasonIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
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
        for (let i = 0; i < count; i++) particles.push(createParticle(cfg, layer, width, height, true, dpr))
      }
    }

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      // 파티클은 작고 이미 블러/애니메이션으로 부드러워서 굳이 고해상도 스프라이트가 필요 없다 —
      // dpr을 1.5로 제한해 스프라이트 생성 비용과 drawImage 픽셀 양을 줄인다.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
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

      // 레이어(뒤→앞) 순서로 그려서 앞 레이어가 뒤 레이어를 자연스럽게 덮도록 한다.
      // 블러는 이미 스프라이트에 구워져 있으므로 여기서는 filter를 전혀 건드리지 않는다.
      for (let layer = 0; layer < 3; layer++) {
        const L = LAYERS[layer]
        for (const p of particles) {
          if (p.layer !== layer) continue
          p.y += p.speed * L.speedMul * dt
          p.x += Math.sin(now / 1000 * p.swayFreq + p.swayPhase) * p.swayAmp * dt + wind.value * 22 * dt
          p.rot += p.rotSpeed * dt
          if (p.y - p.halfH > height + 40) {
            Object.assign(p, createParticle(cfg, layer, width, height, false, dpr))
          }
          if (p.x < -60) p.x = width + 40
          if (p.x > width + 60) p.x = -40

          ctx!.save()
          ctx!.translate(p.x, p.y)
          ctx!.rotate(p.rot)
          ctx!.globalAlpha = p.baseOpacity * L.opacityMul * scrollFactor
          ctx!.drawImage(p.sprite, -p.halfW, -p.halfH, p.halfW * 2, p.halfH * 2)
          ctx!.restore()
        }
      }

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
