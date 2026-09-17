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

// 쿠폰함에 표시할 짧은 사용 코드 — 학생이 학원에서 이 코드를 보여주면 관리자가
// 학생을 일일이 찾지 않고 코드로 바로 검색해서 사용 처리할 수 있다.
// 헷갈리기 쉬운 문자(0/O, 1/I/L)는 제외했다.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateCouponCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return `${s.slice(0, 3)}-${s.slice(3)}`
}
