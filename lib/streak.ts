export type StreakRec = { date: string; hw_rate: number }

// 숙제 이행률 100%가 이어지는 연속 일수를 계산한다. 숙제가 없는 날(-1)은 흐름을 끊지
// 않고 건너뛰고, 100% 미만이거나 미제출(-2)이면 스트릭이 끊긴다.
// recs는 시간순(오래된 -> 최신)으로 정렬되어 있어야 한다.
export function computeStreak(chronoRecs: StreakRec[]): { current: number; best: number } {
  let best = 0
  let running = 0
  for (const r of chronoRecs) {
    if (r.hw_rate === -1) continue
    if (r.hw_rate === 100) { running++; best = Math.max(best, running) }
    else running = 0
  }
  return { current: running, best }
}

// 쿠폰 시스템에서 다루는 마일스톤 (5일 단위, 최대 30일)
export const COUPON_MILESTONES = [5, 10, 15, 20, 25, 30]
