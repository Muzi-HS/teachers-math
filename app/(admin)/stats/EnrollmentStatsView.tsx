'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EnrollmentStatsDashboard from '@/components/EnrollmentStatsDashboard'
import type { TenureSnapshot } from '@/components/EnrollmentTenure'
import type { EnrollmentExport, EnrollmentGrain, EnrollmentSummary } from '@/lib/enrollment-stats'

export default function EnrollmentStatsView() {
  const [grain,setGrain] = useState<EnrollmentGrain>('month')
  const [summary,setSummary] = useState<EnrollmentSummary | null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [retry,setRetry] = useState(0)
  const [exporting,setExporting] = useState(false)
  const [exportMessage,setExportMessage] = useState<{ text:string; ok:boolean } | null>(null)
  async function downloadExcel() {
    if (exporting || !summary || loading) return
    setExporting(true); setExportMessage(null)
    try {
      const { data,error } = await supabase.rpc('admin_student_enrollment_export')
      if (error || !data || (['month','quarter','year'] as const).some(key => data[key]?.scope !== 'all' || !Array.isArray(data[key]?.rows) || !data[key]?.tenure)) throw new Error('export unavailable')
      const { downloadEnrollmentWorkbook } = await import('@/lib/enrollment-export')
      await downloadEnrollmentWorkbook(data as EnrollmentExport)
      setExportMessage({ text:'전체 통계 엑셀 다운로드를 시작했습니다.',ok:true })
    } catch {
      setExportMessage({ text:'엑셀을 다운로드하지 못했습니다. 최신 통계 SQL 적용 여부와 연결 상태를 확인한 뒤 다시 시도해주세요.',ok:false })
    } finally { setExporting(false) }
  }
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(''); setSummary(null)
      try {
        const { data,error } = await supabase.rpc('admin_student_enrollment_summary',{ p_year:null,p_grain:grain })
        if (!active) return
        if (error || !data?.tenure || !('rangeStart' in data) || !data.rangeEnd || !Array.isArray(data.rows) || data.rows.some((row:{ tenure?:TenureSnapshot }) => !row.tenure)) {
          setError('학생 추이를 불러오지 못했습니다. 최신 통계 SQL 적용 여부와 관리자 권한을 확인하세요.')
        } else setSummary(data as EnrollmentSummary)
      } catch {
        if (active) setError('학생 추이를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  },[grain,retry])
  return <EnrollmentStatsDashboard summary={summary} grain={grain}
    loading={loading} error={error} onGrainChange={setGrain} onRefresh={() => setRetry(n => n+1)}
    onDownload={() => void downloadExcel()} exporting={exporting} exportMessage={exportMessage} />
}
