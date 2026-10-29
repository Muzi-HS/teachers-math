import { UNIVERSITY_THEMES, type UniversityTheme } from '@/lib/student-theme'
import UniversityEmblem from './UniversityEmblem'
import s from './UniversityTheme.module.css'

export default function UniversityBrandPanel({ theme }: { theme: UniversityTheme }) {
  const university = UNIVERSITY_THEMES[theme]
  return <section className={s.brandPanel} data-campus={theme} aria-label={`${university.name} 테마`}>
    <div className={s.brandCopy}><span className={s.collection}>MY DREAM CAMPUS</span><strong>{university.short}</strong><span className={s.brandEnglish}>{university.english}</span><div className={s.brandRule} /><p>{university.motto}</p></div>
    <div className={s.brandPennant}><UniversityEmblem theme={theme} variant="crest" /><span>{theme === 'university-snu' ? 'VERITAS LUX MEA' : theme === 'university-yonsei' ? '1885' : '1905'}</span></div>
    <UniversityEmblem theme={theme} className={s.brandWatermark} />
  </section>
}
