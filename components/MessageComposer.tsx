'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstNow } from '@/lib/kst'
import { parentPhone, recipientPhone, smsComposeUrl, unreadStudentIds } from '@/lib/sms-compose'
import styles from './MessageComposer.module.css'
import { useMobileMode } from '@/context/MobileModeContext'

type Student = { id: number; name: string; school: string | null; school_type: string | null; birth_year: number | null; parent_phone: string | null; phone: string | null }
type Class = { id: number; name: string; active?: boolean }
type Member = { student_id: number; class_id: number }
type Directory = { students: Student[]; classes: Class[]; memberships: Member[] }

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499)
    if (result.error) throw new Error('조회 실패')
    rows.push(...(result.data ?? []))
    if ((result.data ?? []).length < 500) return rows
  }
}

export default function MessageComposer({ noticeId, noticeTitle, onClose }: { noticeId?: number; noticeTitle?: string; onClose?: () => void }) {
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const allowed = role === 'admin' || role === 'teacher'
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<string[]>([])
  const [schools, setSchools] = useState<string[]>([])
  const [ages, setAges] = useState<string[]>([])
  const [classIds, setClassIds] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [opened, setOpened] = useState(false)
  const [recipient, setRecipient] = useState<'parent' | 'student'>('parent')
  const target = noticeId !== undefined ? 'parent' : recipient
  const targetLabel = target === 'parent' ? '학부모' : '학생'
  const phoneOf = (s: Student) => recipientPhone(s, target, noticeId !== undefined)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(''); setSelected([]); setStudents([])
      if (!allowed) { setLoading(false); return }
      try {
        let directory: Directory
        if (role === 'teacher') {
          const result = await supabase.rpc('teacher_student_directory')
          if (result.error || !result.data) throw new Error('학생 조회 실패')
          directory = result.data as Directory
        } else {
          const [studentRows, classRows, memberRows] = await Promise.all([
            allRows<Student>((from, to) => supabase.from('students').select('id,name,school,school_type,birth_year,parent_phone,phone').order('name').order('id').range(from, to)),
            allRows<Class>((from, to) => supabase.from('classes').select('id,name,active').order('name').order('id').range(from, to)),
            allRows<Member>((from, to) => supabase.from('class_students').select('student_id,class_id').order('student_id').order('class_id').range(from, to)),
          ])
          directory = { students: studentRows, classes: classRows, memberships: memberRows }
        }
        let eligible = directory.students
        if (noticeId !== undefined) {
          const [notice, targets, reads] = await Promise.all([
            supabase.from('notices').select('id,parent_visible').eq('id', noticeId).single(),
            allRows<{ student_id: number }>((from, to) => supabase.from('notice_target_students').select('student_id').eq('notice_id', noticeId).order('student_id').range(from, to)),
            allRows<{ student_id: number }>((from, to) => supabase.from('notice_reads').select('student_id').eq('notice_id', noticeId).order('student_id').range(from, to)),
          ])
          if (notice.error || !notice.data?.parent_visible) throw new Error('공지 조회 실패')
          const ids = new Set(unreadStudentIds(eligible.map(s => s.id), targets.map(s => s.student_id), reads.map(s => s.student_id)))
          eligible = eligible.filter(s => ids.has(s.id))
        }
        if (cancelled) return
        setStudents(eligible); setClasses(directory.classes.filter(c => c.active !== false)); setMembers(directory.memberships)
        if (noticeId !== undefined) setSelected(eligible.filter(s => parentPhone(s.parent_phone)).map(s => s.id))
      } catch {
        if (!cancelled) setError('수신 대상 정보를 불러오지 못했습니다. 다시 시도해주세요.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [allowed, role, noticeId, attempt])

  const year = kstNow().getFullYear()
  const age = (s: Student) => s.birth_year ? String(year - s.birth_year + 1) : ''
  const filtered = students.filter(s => s.name.includes(search.trim()) && (!stage.length || stage.includes(s.school_type ?? '')) && (!schools.length || schools.includes(s.school ?? '')) && (!ages.length || ages.includes(age(s))) && (!classIds.length || members.some(m => m.student_id === s.id && classIds.includes(String(m.class_id)))))
  const selectedStudents = students.filter(s => selected.includes(s.id) && phoneOf(s))
  const phones = [...new Set(selectedStudents.map(s => phoneOf(s)!))]
  const missing = students.filter(s => !phoneOf(s)).length
  const selectableIds = filtered.filter(s => phoneOf(s)).map(s => s.id)
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every(id => selected.includes(id))
  const someFilteredSelected = selectableIds.some(id => selected.includes(id))
  function toggle(id: number) { setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]); setOpened(false) }
  function filter(label: string, values: string[], chosen: string[], update: (values: string[]) => void) {
    return <fieldset><legend>{label}</legend><div className={styles.pills}><button type="button" aria-pressed={!chosen.length} onClick={() => update([])}>전체</button>{values.map(value => <button type="button" key={value} data-stage={label === '학교급' ? value : undefined} data-class={label === '소속 반' || undefined} aria-pressed={chosen.includes(value)} onClick={() => update(chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value])}>{label === '소속 반' ? classes.find(c => String(c.id) === value)?.name : label === '학교급' ? ({ '초등': '초등학교', '중등': '중학교', '고등': '고등학교' }[value] ?? value) : value}{label === '나이' ? '세' : ''}</button>)}</div></fieldset>
  }

  if (!allowed) return <p>관리자와 담당 선생님만 메시지를 보낼 수 있습니다.</p>
  return <section className={`${styles.composer} ${mobileMode ? styles.mobile : ''} ${onClose ? styles.inDialog : ''}`}>
    <header><div><h1>메시지 보내기</h1><p>{noticeId !== undefined ? '공지를 읽지 않은 학생의 학부모에게 안내합니다.' : '학생을 선택하고 보낼 내용을 작성하세요.'}</p></div>{onClose && <button onClick={onClose} aria-label="메시지 창 닫기">닫기</button>}</header>
    {noticeTitle && <p className={styles.notice}>공지: <strong>{noticeTitle}</strong></p>}
    {noticeId === undefined && <div className={styles.recipientBar}>
      <div><h2>받는 사람</h2><p>선택한 대상의 휴대폰 번호로 전송합니다.</p></div>
      <div className={styles.recipientOptions} role="group" aria-label="메시지 수신 대상">
        {(['parent', 'student'] as const).map(value => <button key={value} type="button" aria-pressed={target === value} onClick={() => {
          if (recipient === value) return
          setRecipient(value); setSelected([]); setOpened(false); setConfirm(false)
        }}>{value === 'parent' ? '학부모에게' : '학생에게'}</button>)}
      </div>
      <p className={styles.recipientHint}>받는 사람을 변경하면 선택이 초기화됩니다. 작성한 내용은 유지됩니다.</p>
    </div>}
    <div className={styles.card}>
    <div className={styles.cardHeading}><h2>{noticeId !== undefined ? '미열람 학생' : role === 'teacher' ? '담당 학생' : '전체 학생'} <span>{filtered.length}명</span></h2><span>{targetLabel} 수신 대상 선택</span></div>
    {loading ? <p role="status">수신 대상 불러오는 중...</p> : error ? <p role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>다시 시도</button></p> : <>
      <div className={styles.searchRow}><div className={styles.searchBox}><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input aria-label="학생 이름 검색" placeholder="학생 이름 검색..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        {(search || stage.length > 0 || schools.length > 0 || ages.length > 0 || classIds.length > 0) && <button className={styles.reset} onClick={() => { setSearch(''); setStage([]); setSchools([]); setAges([]); setClassIds([]) }}>필터 초기화</button>}
      </div>
      {filter('학교급', ['초등', '중등', '고등'], stage, values => { setStage(values); setSchools([]) })}
      {stage.length > 0 && filter('학교', [...new Set(students.filter(s => stage.includes(s.school_type ?? '')).map(s => s.school).filter((v): v is string => !!v))].sort(), schools, setSchools)}
      {filter('나이', [...new Set(students.map(age).filter(Boolean))].sort((a,b) => Number(a)-Number(b)), ages, setAges)}
      {filter('소속 반', classes.map(c => String(c.id)), classIds, setClassIds)}
      <div className={styles.actions}>
        <button onClick={() => setSelected([])}>모든 선택 해제</button>
      </div>
      <p>검색 결과 {filtered.length}명 · 선택 {selectedStudents.length}명 · 발송 번호 {phones.length}개 (중복 제거)</p>
      {missing > 0 && <p>{targetLabel} 휴대폰 번호가 없거나 올바르지 않은 학생 {missing}명은 선택할 수 없습니다.</p>}
      <div className={styles.list}><table><thead><tr><th className={styles.checkCell}><label className={styles.selectAll}><input type="checkbox" aria-label="검색 결과 전체 선택" disabled={!selectableIds.length} checked={allFilteredSelected} ref={node => { if (node) node.indeterminate = someFilteredSelected && !allFilteredSelected }} onChange={() => { setSelected(ids => allFilteredSelected ? ids.filter(id => !selectableIds.includes(id)) : [...new Set([...ids, ...selectableIds])]); setOpened(false) }} /></label></th><th>이름</th>{!mobileMode && <><th>나이</th><th>학교</th></>}<th>{targetLabel} 연락처</th>{!mobileMode && <th>소속 반</th>}</tr></thead><tbody>{filtered.map(s => <tr key={s.id} data-selected={selected.includes(s.id)}>
        <td className={styles.checkCell}><label className={styles.rowSelect}><input aria-label={`${s.name} ${targetLabel} 선택`} type="checkbox" checked={selected.includes(s.id)} disabled={!phoneOf(s)} onChange={() => toggle(s.id)} /></label></td>
        <td><div className={styles.studentName}><strong>{s.name}</strong>{s.school_type && <span className={styles.badge} data-stage={s.school_type}>{s.school_type}</span>}</div>{mobileMode && <small>{s.school || '학교 미등록'}{age(s) && ` · ${age(s)}세`}</small>}</td>
        {!mobileMode && <><td>{age(s) ? `${age(s)}세` : '-'}</td><td>{s.school || '-'}</td></>}
        <td className={styles.phone}>{phoneOf(s) || <span className={styles.muted}>번호 확인 필요</span>}</td>
        {!mobileMode && <td><div className={styles.classBadges}>{classes.filter(c => members.some(m => m.class_id === c.id && m.student_id === s.id)).map(c => <span className={styles.classBadge} key={c.id}>{c.name}</span>)}</div></td>}
      </tr>)}</tbody></table>{!filtered.length && <p className={styles.empty}>해당하는 학생이 없습니다.</p>}</div>
      <p className={styles.hint}>필터를 바꿔도 선택은 유지됩니다. 같은 수신번호는 중복 제거됩니다.</p>
    </>}
    </div>
    {!loading && !error && <div className={styles.card}>
      <div className={styles.cardHeading}><h2>메시지 작성</h2><span>수신번호 {phones.length}개</span></div>
      <label className={styles.body}>메시지 내용<textarea rows={6} value={body} onChange={e => { setBody(e.target.value); setOpened(false) }} placeholder={target === 'parent' ? '학부모님께 보낼 내용을 입력하세요.' : '학생에게 보낼 내용을 입력하세요.'} /></label>
      <div className={styles.sendBar}><p className={styles.hint}>휴대폰 문자 앱에서 수신번호와 내용을 확인한 후 전송해주세요.</p><button className={styles.primary} disabled={!phones.length || !body.trim()} onClick={() => setConfirm(true)}>일괄 전송 준비 · {phones.length}개 번호</button></div>
      {opened && <p role="status" className={styles.hint}>문자 앱 연결을 요청했습니다. 실제 발송 여부는 문자 앱에서 확인해주세요.</p>}
    </div>}
    {confirm && <div className={styles.overlay}><div role="dialog" aria-modal="true" aria-label="문자 전송 확인" className={styles.confirm}>
      <h2>문자 앱으로 보내기</h2><p>{targetLabel}에게 전송 · 선택 학생 {selectedStudents.length}명 · 수신번호 {phones.length}개</p>
      <div className={styles.preview}>{selectedStudents.map(s => <div key={s.id}>{s.name} · {phoneOf(s)}</div>)}</div>
      <p className={styles.preview}>{body}</p>
      <p>본인 휴대폰 번호와 통신요금제로 발송됩니다. 여러 수신자·내용 자동 입력 지원은 기기마다 다릅니다. 문자 앱에서 누락된 번호와 내용을 확인해주세요.</p>
      <p><strong>수신자끼리 번호가 보이지 않도록 문자 앱의 개별 발송 설정을 확인해주세요.</strong> 그룹 대화로 표시된다면 취소하고 개별 발송으로 변경해주세요.</p>
      <p>PC에서는 휴대폰 연동이 필요합니다. 전송 버튼은 문자 앱에서 직접 눌러야 합니다.</p>
      <div className={styles.actions}><button onClick={() => setConfirm(false)}>돌아가기</button><button className={styles.primary} onClick={() => {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        window.location.href = smsComposeUrl(phones, body, ios)
        setConfirm(false); setOpened(true)
      }}>문자 앱 열기</button></div>
    </div></div>}
  </section>
}

export function MessageComposerDialog({ onClose }: { onClose: () => void }) {
  return <div className={styles.dialogBackdrop}>
    <div role="dialog" aria-modal="true" aria-label="메시지 보내기" className={styles.dialog}>
      <MessageComposer onClose={onClose} />
    </div>
  </div>
}
