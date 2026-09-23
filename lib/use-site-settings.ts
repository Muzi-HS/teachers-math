'use client'
import { useEffect, useState } from 'react'
import { fetchSiteSettings, DEFAULT_SITE_SETTINGS, type SiteSettings } from '@/lib/site-settings'
import { getSeasonByDate, type Season } from '@/lib/season'

// 홈페이지·관리자 레이아웃 등 계절 효과를 표시하는 모든 곳이 공유하는 설정 조회 훅.
export function useSiteSettings(): { settings: SiteSettings; effectiveSeason: Season } {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  useEffect(() => { fetchSiteSettings().then(setSettings) }, [])
  const effectiveSeason = settings.seasonMode === 'auto' ? getSeasonByDate() : settings.season
  return { settings, effectiveSeason }
}
