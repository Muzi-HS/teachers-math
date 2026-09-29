'use client'

import { useEffect, useState } from 'react'
import { getPublicHolidays, PublicHoliday } from '@/lib/korean-public-holidays'

const cache = new Map<number, PublicHoliday[]>()

export function usePublicHolidays(year: number) {
  const [result, setResult] = useState<{ year: number; holidays: PublicHoliday[] } | null>(null)

  useEffect(() => {
    let active = true
    if (cache.has(year)) return
    fetch(`/api/public-holidays?year=${year}`)
      .then(async response => {
        if (!response.ok) throw new Error('holiday request failed')
        const data = await response.json() as { holidays: PublicHoliday[] }
        if (!Array.isArray(data.holidays)) throw new Error('invalid holiday response')
        cache.set(year, data.holidays)
        if (active) setResult({ year, holidays: data.holidays })
      })
      .catch(() => {})
    return () => { active = false }
  }, [year])

  const current = result?.year === year ? result.holidays : cache.get(year)
  return { year, holidays: current ?? getPublicHolidays(year), fallback: !current }
}
