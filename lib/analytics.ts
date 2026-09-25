export type AnalyticsSummary = {
  totalVisits: number
  todayCount: number
  monthCount: number
  consultThisMonth: number
  consultTotal: number
  mobilePct: number
  unreadInquiries: number
  pendingTeachers: number
  dailyChartData: { date: string; count: number }[]
  monthlyChartData: { month: string; visits: number; consults: number }[]
}

export const EMPTY_ANALYTICS: AnalyticsSummary = {
  totalVisits: 0, todayCount: 0, monthCount: 0, consultThisMonth: 0, consultTotal: 0,
  mobilePct: 0, unreadInquiries: 0, pendingTeachers: 0, dailyChartData: [], monthlyChartData: [],
}
