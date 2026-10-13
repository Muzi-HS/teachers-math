'use client'
import { useRouter } from 'next/navigation'
import { IconClipboard } from '@/components/icons'

export default function StudentTestLaunch() {
 const router = useRouter()
 return <button onClick={() => router.push('/student/tests')} style={{
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46,
  background: '#fff', border: '1px solid #DDE8DF', borderRadius: 10, color: '#6A7B6E', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 14,
 }}><IconClipboard size={16} />확인할 시험</button>
}
