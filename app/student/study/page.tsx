import Link from 'next/link'
import StudyTimer from '@/components/StudyTimer'

export default function StudentStudyPage() {
 return <div>
  <Link href="/student/home" style={{display:'inline-flex',alignItems:'center',minHeight:44,color:'var(--student-456650, #456650)',fontSize:13,textDecoration:'none'}}>← 학생 홈</Link>
  <h1 style={{fontSize:22,fontWeight:700,color:'var(--student-203f30, #203f30)',margin:'10px 0 6px'}}>나만의 집중 시간</h1>
  <p style={{fontSize:12,color:'var(--student-6a7b6e, #6a7b6e)',margin:'0 0 20px'}}>목표를 정하고, 나만의 속도로 차근차근.</p>
  <StudyTimer />
 </div>
}
