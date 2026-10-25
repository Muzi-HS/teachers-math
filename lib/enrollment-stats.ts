import type { TenureSnapshot } from '@/components/EnrollmentTenure'

export type EnrollmentGrain = 'month' | 'quarter' | 'year'
export type EnrollmentPeriod = {
  start:string; end:string; enrolled:number; registrations:number; withdrawals:number;
  earlyWithdrawals:number; tenure:TenureSnapshot
}
export type EnrollmentSummary = {
  today:string; trackingStartedOn:string; currentEnrolled:number; unknownDates:number;
  rangeStart:string | null; rangeEnd:string;
  rows:EnrollmentPeriod[]; tenure:TenureSnapshot
}
export type EnrollmentExport = Record<EnrollmentGrain,EnrollmentSummary & { scope:'all' }>
