// 배점은 소수점 둘째 자리까지 저장된다. 남는 0.01점은 앞 문항부터 나눠 합계를 100점으로 맞춘다.
export function defaultQuestionPoints(count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 200) return []
  // 현재 DB는 문항당 최소 1점을 요구하므로 100문항 초과 시에는 1점씩 배정한다.
  if (count > 100) return Array(count).fill(1)
  const cents = Math.floor(10000 / count)
  const remainder = 10000 - cents * count
  return Array.from({ length: count }, (_, index) => (cents + (index < remainder ? 1 : 0)) / 100)
}
