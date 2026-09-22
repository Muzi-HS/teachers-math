'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import HeaderAlt from '@/components/landing-preview/HeaderAlt'
import HeroSectionAlt from '@/components/landing-preview/HeroSectionAlt'
import AboutSectionAlt from '@/components/landing-preview/AboutSectionAlt'
import PhilosophySectionAlt from '@/components/landing-preview/PhilosophySectionAlt'
import TeachingMethodSection from '@/components/landing-preview/TeachingMethodSection'
import StudentManagementSection from '@/components/landing-preview/StudentManagementSection'
import LessonRecordPreviewSection from '@/components/landing-preview/LessonRecordPreviewSection'
import NaverBlogSection from '@/components/landing-preview/NaverBlogSection'
import SpecialClassSection from '@/components/landing-preview/SpecialClassSection'
import ConsultationSection from '@/components/landing-preview/ConsultationSection'
import LocationSection from '@/components/landing-preview/LocationSection'
import InstallSection from '@/components/landing-preview/InstallSection'
import LoginPanel from '@/components/landing-preview/LoginPanel'
import ScrollToTopButton from '@/components/landing-preview/ScrollToTopButton'

export default function HomePage() {
  const router = useRouter()
  const { role, loading: authLoading } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  // 로그인 패널에서 로그인에 성공하면 실제 계정 유형에 맞는 화면으로 이동한다.
  useEffect(() => {
    if (authLoading || !role) return
    if (role === 'admin' || role === 'teacher' || role === 'assistant') router.replace('/dashboard')
    else if (role === 'parent') router.replace('/parent/records')
    else if (role === 'student') router.replace('/student/records')
  }, [role, authLoading, router])

  return (
    <div style={{ fontFamily: "'Noto Sans KR',sans-serif", position: 'relative', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');
        .lpv-reveal{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
        .lpv-reveal[data-shown="true"]{opacity:1;transform:translateY(0)}
        .lpv-page-shift{transition:transform .55s cubic-bezier(.16,1,.3,1)}
        .lpv-page-shift[data-shift="true"]{transform:translateX(-72px)}
        section[id]{scroll-margin-top:70px}
        @media (max-width:768px){
          .lpv-page-shift[data-shift="true"]{transform:translateX(0)}
        }
        @media (prefers-reduced-motion: reduce){
          .lpv-reveal{transition:none}
          .lpv-page-shift{transition:none}
        }
      `}</style>

      <div className="lpv-page-shift" data-shift={loginOpen}>
        <HeaderAlt onLoginClick={() => setLoginOpen(true)} />
        <HeroSectionAlt />
        <AboutSectionAlt />
        <PhilosophySectionAlt />
        <TeachingMethodSection />
        <StudentManagementSection />
        <LessonRecordPreviewSection />
        <NaverBlogSection />
        <SpecialClassSection />
        <ConsultationSection />
        <LocationSection />
        <InstallSection />
      </div>

      <LoginPanel open={loginOpen} onClose={() => setLoginOpen(false)} />
      <ScrollToTopButton />
    </div>
  )
}
