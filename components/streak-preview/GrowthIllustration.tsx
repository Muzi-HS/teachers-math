import { useId } from 'react'
import treeStyles from './GrowthIllustration.module.css'

type Props = { kind: 'flame' | 'tree'; stage: number; reached?: boolean; current?: boolean }

// The 6 tree-growth stages are the provided PNG illustrations (public/assets/streak-tree/),
// used as-is — not redrawn. Mapping: 5일 seed, 10일 sprout, 15일 young-tree, 20일 branch-growth,
// 25일 full-tree, 30일 fruit-tree.
const TREE_STAGE_FILES = [
  'seed.png',
  'sprout.png',
  'young-tree.png',
  'branch-growth.png',
  'full-tree.png',
  'fruit-tree.png',
]

// Flat silhouettes share a canvas. The flame icon is untouched hand-drawn SVG; the tree icon
// loads one of the 6 provided PNG assets above. Current-stage scale/ring and hover motion are
// already handled by the surrounding card CSS (.iconCircle/.current/.illustration) — nothing
// extra is added here so that highlighting stays exactly as it was.
export default function GrowthIllustration({ kind, stage, reached = true }: Props) {
  const gradientId = useId()

  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true">
      {kind === 'flame' ? <>
        <defs>
          <linearGradient id={gradientId + '-outer'} x1="17" y1="20" x2="49" y2="57" gradientUnits="userSpaceOnUse">
            <stop stopColor={reached ? '#FF7545' : '#CDD6D1'} />
            <stop offset="1" stopColor={reached ? '#FFBE55' : '#E2E8E4'} />
          </linearGradient>
          <linearGradient id={gradientId + '-inner'} x1="30" y1="29" x2="36" y2="61" gradientUnits="userSpaceOnUse">
            <stop stopColor={reached ? '#FFAB43' : '#DCE3DE'} />
            <stop offset="1" stopColor={reached ? '#FFDA78' : '#EFF2EF'} />
          </linearGradient>
        </defs>
        <path d="M32 61C18 61 9 53 10 40C10 32 15 25 21 18L21 25C28 17 31 10 32 3C40 7 45 15 46 25L50 20C55 29 57 39 53 48C50 57 42 61 32 61Z" fill={'url(#' + gradientId + '-outer)'} />
        <path d="M33 61C24 61 19 55 20 47C21 39 29 35 33 25C34 34 43 39 44 47C45 55 40 61 33 61Z" fill={'url(#' + gradientId + '-inner)'} />
      </> : (
        <image
          href={`/assets/streak-tree/${TREE_STAGE_FILES[stage]}`}
          x="0" y="0" width="64" height="64"
          preserveAspectRatio="xMidYMid meet"
          className={treeStyles.treeImage}
          style={!reached ? { filter: 'grayscale(1)', opacity: 0.45 } : undefined}
        />
      )}
    </svg>
  )
}
