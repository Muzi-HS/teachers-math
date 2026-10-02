export type ScheduleSummaryEvent = {
  id: number; title: string; start_date: string; end_date: string | null
  start_time: string | null; end_time: string | null
  type?: string; category?: string; completed?: boolean; owner?: string; location?: string
}

export function shiftScheduleDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function scheduleWeek(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const start = shiftScheduleDate(today, -((weekday + 6) % 7))
  return { start, end: shiftScheduleDate(start, 6) }
}

export function schedulesInRange(events: ScheduleSummaryEvent[], start: string, end = start) {
  return events.filter(event => event.start_date <= end && (event.end_date ?? event.start_date) >= start)
    .sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || a.start_date.localeCompare(b.start_date)
      || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.id - b.id)
}
