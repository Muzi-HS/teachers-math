'use client'

import { useState } from 'react'
import ParentPreview, { type ParentPreviewTopic } from '@/components/parent-preview/ParentPreview'
import Reveal from './Reveal'

const deep = '#154A32'
const deep2 = '#2A6349'
const descriptions: Record<ParentPreviewTopic, { title: string; body: string }> = {
  records: { title: '수업의 과정을 기록합니다.', body: '날짜별 수업 내용과 숙제, 숙제 이행률·정답률, 수업 태도와 선생님의 피드백을 확인할 수 있습니다. 오른쪽 수업기록 메뉴를 눌러 직접 살펴보세요.' },
  home: { title: '최근 수업을 홈에서 확인합니다.', body: '학부모 홈에는 가장 최근 수업의 기록이 먼저 보입니다. 수업 내용과 숙제, 학습 상태를 한 화면에서 확인할 수 있습니다.' },
  stats: { title: '변화를 통계로 살펴봅니다.', body: '통계 보기에서는 숙제 이행률과 정답률의 평균, 수업별 추이 그래프를 확인할 수 있습니다.' },
  attendance: { title: '지각·결석을 홈에서 등록합니다.', body: '실제 학부모 계정에서는 홈의 지각·결석 등록 버튼으로 자녀와 날짜, 사유를 입력할 수 있습니다. 메인 화면에서는 기능 설명을 확인해 보세요.' },
  comment: { title: '수업기록에 의견을 남깁니다.', body: '학부모는 최근 수업기록을 보며 선생님께 궁금한 점이나 의견을 바로 남길 수 있습니다. 체험 내용은 예시 화면에만 표시됩니다.' },
  child: { title: '자녀별 기록을 바꿔 봅니다.', body: '자녀를 선택하면 해당 자녀의 최근 수업기록과 통계가 함께 바뀝니다.' },
  notices: { title: '공지사항을 확인합니다.', body: '학원에서 보낸 안내와 수업 준비물을 공지 메뉴에서 확인할 수 있습니다.' },
  schedule: { title: '학원일정을 살펴봅니다.', body: '다가오는 학원일정을 홈에서 확인하고, 학원일정 메뉴에서 자세히 살펴볼 수 있습니다.' },
  inquiries: { title: '선생님께 문의합니다.', body: '수업기록에 대한 의견과 별개로, 문의하기 메뉴에서 선생님과 대화할 수 있습니다.' },
}

export default function LessonRecordPreviewSection() {
  const [topic, setTopic] = useState<ParentPreviewTopic>('records')
  const description = descriptions[topic]
  return <section id="lesson-record-preview" style={{ background: '#EAF7F0', padding: '100px 20px' }}>
    <div style={{ maxWidth: 640, margin: '0 auto 56px', textAlign: 'center' }}>
      <Reveal><span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>LESSON RECORD</span></Reveal>
      <Reveal delay={100}><h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 22, wordBreak: 'keep-all' }}>수업이 끝난 뒤에도<br />학습의 과정은 기록됩니다.</h2></Reveal>
      <Reveal delay={200}><p style={{ fontSize: 14.5, lineHeight: 2, color: deep2, wordBreak: 'keep-all' }}>학부모가 &ldquo;오늘 학원에서 무엇을 공부했는지&rdquo;, &ldquo;숙제는 얼마나 했는지&rdquo;,<br />&ldquo;어떤 부분을 어려워하는지&rdquo;를 확인할 수 있도록 수업 내용을 기록하여 제공합니다.</p></Reveal>
    </div>
    <Reveal>
      <div style={{ maxWidth: 880, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 420px)', alignItems: 'center', gap: 40 }} className="lesson-preview-layout">
        <div style={{ color: deep, padding: '0 8px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: deep2 }}>학부모 화면 체험</p>
          <h3 key={topic} aria-live="polite" style={{ fontSize: 'clamp(19px, 3vw, 26px)', lineHeight: 1.5, margin: '12px 0 16px', wordBreak: 'keep-all' }}>{description.title}</h3>
          <p style={{ fontSize: 13, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>{description.body}</p>
          <p style={{ fontSize: 11, color: deep2, marginTop: 16 }}>학생 이름과 학습 내용은 설명용 예시입니다. 체험 중 입력한 내용은 실제 계정에 저장되지 않습니다.</p>
        </div>
        <ParentPreview embedded initialTab="home" onAction={setTopic} />
      </div>
    </Reveal>
    <Reveal delay={150}>
      <p style={{ maxWidth: 640, margin: '90px auto 0', textAlign: 'center', fontSize: 'clamp(19px, 2.6vw, 25px)', fontWeight: 700, color: deep, lineHeight: 1.7, wordBreak: 'keep-all' }}>
        관리의 목적은 학생을 통제하는 것이 아니라,<br />학생이 자신의 학습을 스스로 이어갈 수 있도록 돕는 것입니다.
      </p>
    </Reveal>
    <style>{`@media (max-width: 760px) { .lesson-preview-layout { grid-template-columns: 1fr !important; gap: 26px !important; } .lesson-preview-layout > div:first-child { text-align: center; } }`}</style>
  </section>
}
