import type { UniversityTheme } from '@/lib/student-theme'

const assets: Record<UniversityTheme, { symbol: string; crest: string; dial: string }> = {
  'university-snu': { symbol: 'snu-emblem.png', crest: 'snu-emblem.png', dial: 'snu-emblem.png' },
  'university-yonsei': { symbol: 'yonsei-eagle.svg', crest: 'yonsei-seal.png', dial: 'yonsei-seal-hires.png' },
  'university-korea': { symbol: 'korea-tiger.png', crest: 'korea-shield.png', dial: 'korea-shield.png' },
}

export default function UniversityEmblem({ theme, className = '', variant = 'symbol' }: { theme: UniversityTheme; className?: string; variant?: 'symbol' | 'crest' | 'dial' }) {
  return <span aria-hidden="true" data-university={theme} data-emblem={variant} className={`university-art ${className}`} style={{ backgroundImage: `url('/themes/universities/${assets[theme][variant]}')` }} />
}
