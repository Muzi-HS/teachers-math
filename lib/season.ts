export type Season = 'spring' | 'autumn' | 'winter' | 'none'
export type SeasonMode = 'manual' | 'auto'
export type SeasonIntensity = 'low' | 'normal' | 'high'

// 자동 계절 판정 기준(월, 1~12). 필요하면 이 값만 바꾸면 된다.
export const AUTO_SEASON_MONTHS: Record<Exclude<Season, 'none'>, number[]> = {
  spring: [3, 4, 5],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
}

// 오늘 날짜 기준으로 계절을 판정한다. 6~8월(여름)은 효과 없음(none).
export function getSeasonByDate(date: Date = new Date()): Season {
  const month = date.getMonth() + 1
  for (const season of Object.keys(AUTO_SEASON_MONTHS) as (keyof typeof AUTO_SEASON_MONTHS)[]) {
    if (AUTO_SEASON_MONTHS[season].includes(month)) return season
  }
  return 'none'
}

export const INTENSITY_MULTIPLIER: Record<SeasonIntensity, number> = {
  low: 0.5,
  normal: 1,
  high: 1.55,
}
