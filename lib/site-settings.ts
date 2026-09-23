import { supabase } from '@/lib/supabase'
import type { Season, SeasonMode, SeasonIntensity } from '@/lib/season'

export type SiteSettings = {
  seasonEffectEnabled: boolean
  seasonMode: SeasonMode
  season: Season
  seasonIntensity: SeasonIntensity
}

// 설정을 불러오지 못하면(네트워크 오류, 행 없음 등) 효과 없이 기존 홈페이지가 그대로
// 보여야 하므로 seasonEffectEnabled: false가 기본값이다.
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  seasonEffectEnabled: false,
  seasonMode: 'manual',
  season: 'none',
  seasonIntensity: 'normal',
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('season_effect_enabled, season_mode, season, season_intensity')
      .eq('id', 1)
      .maybeSingle()
    if (error || !data) return DEFAULT_SITE_SETTINGS
    return {
      seasonEffectEnabled: !!data.season_effect_enabled,
      seasonMode: data.season_mode === 'auto' ? 'auto' : 'manual',
      season: (['spring', 'autumn', 'winter', 'none'] as const).includes(data.season) ? data.season : 'none',
      seasonIntensity: (['low', 'normal', 'high'] as const).includes(data.season_intensity) ? data.season_intensity : 'normal',
    }
  } catch {
    return DEFAULT_SITE_SETTINGS
  }
}

export async function saveSiteSettings(settings: SiteSettings, updatedBy: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_settings').update({
    season_effect_enabled: settings.seasonEffectEnabled,
    season_mode: settings.seasonMode,
    season: settings.season,
    season_intensity: settings.seasonIntensity,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  }).eq('id', 1)
  return { error: error?.message ?? null }
}
