'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import HomeworkStatsView from '@/components/HomeworkStatsView'

type GrowthRecord = { date: string; hw_rate: number; hw_cor: number }

export default function StudentGrowthPage() {
  const { student } = useAuth()
  const router = useRouter()
  const [records, setRecords] = useState<GrowthRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.studentId || !student.sessionToken) return
    let active = true
    supabase.rpc('client_records', { p_token: student.sessionToken, p_student_id: student.studentId })
      .then(({ data }) => {
        if (!active) return
        setRecords((data ?? []) as GrowthRecord[])
        setLoading(false)
      })
    return () => { active = false }
  }, [student?.studentId, student?.sessionToken])

  return <div>
    <button onClick={() => router.push('/student/home')} style={{ border: 0, background: 'none', padding: '0 0 16px', color: '#456650', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← 홈으로</button>
    {loading ? <p style={{ textAlign: 'center', color: '#768478', padding: '40px 0' }}>불러오는 중...</p> :
      <HomeworkStatsView recs={records} studentId={student?.studentId} sessionToken={student?.sessionToken} growthOnly />}
  </div>
}
