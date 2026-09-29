'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can, Role } from '@/lib/permissions'
import { kstDateStr, kstNow } from '@/lib/kst'
import { IconClock, IconLock } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'
import { usePublicHolidays } from '@/lib/use-public-holidays'
import CompactMonthCalendar from '@/components/CompactMonthCalendar'

type Evt = {
    id: number
    title: string
    start_date: string
    end_date: string | null
    start_time: string | null
    end_time: string | null
    type: 'normal' | 'holiday'
    parent_visible: boolean
    student_visible: boolean
    memo: string | null
}

// 학부모가 등록한 결석/지각 — 관리자/선생님/조교 캘린더에만 표시
type AttNotice = {
    id: number
    parent_id: number
    student_id: number
    date: string
    type: 'absence' | 'late'
    reason: string | null
}

// 반별 휴강 등록 — class_cancellations 테이블
type Cancellation = { id: number; class_id: number; cancel_date: string; memo: string | null }
type ClassRow = { id: number; name: string; days: string }

type FormState = {
  title: string; start_date: string; end_date: string
  start_time: string; end_time: string
  type: 'normal' | 'holiday'
  mode: 'event' | 'cancel'
  targetParent: boolean; targetStudent: boolean
  memo: string; useTime: boolean
  cancelClassIds: number[]
}

const BLANK: FormState = {
    title: '', start_date: '', end_date: '',
    start_time: '', end_time: '',
    type: 'normal',
    mode: 'event',
    targetParent: true, targetStudent: true,
    memo: '', useTime: false,
    cancelClassIds: [],
}

const WEEK_ORDER = ['월', '화', '수', '목', '금', '토', '일']

const navy = 'var(--ui-primary)'
const navyDk = 'var(--ui-primary-text)'
const navyM = 'var(--ui-surface-2)'
const gold = 'var(--ui-primary)'
const goldL = 'var(--ui-primary-hover)'
const bg = 'var(--ui-bg)'
const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)'
const tx2 = 'var(--ui-text-2)'
const tx3 = 'var(--ui-text-3)'
const re = 'var(--ui-danger)'
const saturday = '#2563A6'
const rbg = 'var(--ui-danger-bg)'
const gr = 'var(--ui-success)'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function SchedulePage() {
    const { teacher, role } = useAuth()
    const { mobileMode } = useMobileMode()
    const [evts, setEvts] = useState<Evt[]>([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState<FormState>({ ...BLANK })
    const [editId, setEditId] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [yr, setYr] = useState(kstNow().getFullYear())
    const [mo, setMo] = useState(kstNow().getMonth())  // 0-based
    const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
    const [attNotices, setAttNotices] = useState<AttNotice[]>([])
    const [cancellations, setCancellations] = useState<Cancellation[]>([])
    const [classesList, setClassesList] = useState<ClassRow[]>([])
    const [studentsMap, setStudentsMap] = useState<Record<number, string>>({})
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [loadError, setLoadError] = useState(false)
    const loadVersion = useRef(0)

    useEffect(() => {
        let active = true
        void supabase.from('students').select('id, name').then(({ data }) => {
            if (!active) return
            const map: Record<number, string> = {}
            for (const s of (data ?? [])) map[s.id] = s.name
            setStudentsMap(map)
        })
        void supabase.from('classes').select('id, name, days').order('name').then(({ data }) => {
            if (active) setClassesList((data ?? []) as ClassRow[])
        })
        return () => { active = false }
    }, [])

    const load = useCallback(async () => {
        const version = ++loadVersion.current

        const ym = `${yr}-${String(mo + 1).padStart(2, '0')}`
        const from = `${ym}-01`

        // ✅ 해당 월의 실제 마지막 날 계산 (6월=30일, 7월=31일 등 정확하게)
        const lastDay = new Date(yr, mo + 1, 0).getDate()
        const to = `${ym}-${String(lastDay).padStart(2, '0')}`

        try {
            const [starts, overlaps, notices, cancels] = await Promise.all([
                supabase.from('events').select('*').gte('start_date', from).lte('start_date', to),
                supabase.from('events').select('*').lt('start_date', from).gte('end_date', from),
                supabase.from('attendance_notices').select('*').gte('date', from).lte('date', to),
                supabase.from('class_cancellations').select('id,class_id,cancel_date,memo').gte('cancel_date', from).lte('cancel_date', to),
            ])
            if (version !== loadVersion.current) return
            if (starts.error || overlaps.error || notices.error || cancels.error) throw new Error('schedule-load')
            setLoadError(false)
            const map = new Map<number, Evt>()
            for (const event of [...(starts.data ?? []), ...(overlaps.data ?? [])]) map.set(event.id, event)
            setEvts([...map.values()].sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')))
            setAttNotices(notices.data ?? [])
            setCancellations((cancels.data ?? []) as Cancellation[])
        } catch {
            if (version === loadVersion.current) {
                setLoadError(true)
                setEvts([])
                setAttNotices([])
                setCancellations([])
            }
        } finally {
            if (version === loadVersion.current) setLoading(false)
        }
    }, [yr, mo])

    useEffect(() => {
        const versionRef = loadVersion
        const timer = window.setTimeout(() => { void load() }, 0)
        return () => { window.clearTimeout(timer); versionRef.current++ }
    }, [load])

    function toast(msg: string, ok = true) {
        setNotif({ msg, ok })
        setTimeout(() => setNotif(null), 3000)
    }

    function openAdd(date?: string) {
        setEditId(null)
        setForm({ ...BLANK, start_date: date ?? '', end_date: date ?? '' })
        setModal(true)
    }

    function openEdit(e: Evt, ev?: React.MouseEvent) {
        ev?.stopPropagation()
        setEditId(e.id)
        setForm({
            title: e.title,
            start_date: e.start_date,
            end_date: e.end_date ?? e.start_date,
            start_time: e.start_time ?? '',
            end_time: e.end_time ?? '',
            type: e.type,
            mode: 'event',
            targetParent: e.parent_visible,
            targetStudent: e.student_visible,
            memo: e.memo ?? '',
            useTime: !!(e.start_time || e.end_time),
            cancelClassIds: [],
        })
        setModal(true)
    }

    // 요일 버튼 하나(예: 월)를 누르면 그 요일에 수업이 있는 반을 한꺼번에 선택/해제한다 —
    // 이미 그 요일 반이 전부 선택된 상태에서 다시 누르면 그 반들만 선택 해제된다.
    function classIdsOnDay(day: string) {
        return classesList.filter(c => (c.days ?? '').split(',').map(d => d.trim()).includes(day)).map(c => c.id)
    }
    function toggleCancelDay(day: string) {
        const ids = classIdsOnDay(day)
        const allSelected = ids.length > 0 && ids.every(id => form.cancelClassIds.includes(id))
        setForm(f => ({
            ...f,
            cancelClassIds: allSelected
                ? f.cancelClassIds.filter(id => !ids.includes(id))
                : Array.from(new Set([...f.cancelClassIds, ...ids])),
        }))
    }
    function toggleCancelAll() {
        const allIds = classesList.map(c => c.id)
        const allSelected = allIds.length > 0 && allIds.every(id => form.cancelClassIds.includes(id))
        setForm(f => ({ ...f, cancelClassIds: allSelected ? [] : allIds }))
    }
    function toggleCancelClass(id: number) {
        setForm(f => ({
            ...f,
            cancelClassIds: f.cancelClassIds.includes(id) ? f.cancelClassIds.filter(x => x !== id) : [...f.cancelClassIds, id],
        }))
    }

    async function save() {
        if (form.mode === 'cancel') {
            if (!form.start_date) return toast('휴강 날짜를 입력하세요.', false)
            if (form.cancelClassIds.length === 0) return toast('휴강할 반을 선택하세요.', false)
            setSaving(true)
            const rows = form.cancelClassIds.map(class_id => ({
                class_id, cancel_date: form.start_date, memo: form.memo || null, created_by: teacher?.userId,
            }))
            const { error } = await supabase.from('class_cancellations').upsert(rows, { onConflict: 'class_id,cancel_date' })
            if (error) { toast('저장 실패: ' + error.message, false); setSaving(false); return }
            toast('휴강이 등록되었습니다.')
            setSaving(false); setModal(false)
            await load()
            return
        }
        if (!form.title.trim()) return toast('제목을 입력하세요.', false)
        if (!form.start_date) return toast('시작 날짜를 입력하세요.', false)
        if (form.end_date && form.end_date < form.start_date) return toast('종료 날짜는 시작 날짜 이후로 선택해주세요.', false)
        if (form.useTime && (!form.end_date || form.end_date === form.start_date) && form.start_time && form.end_time && form.end_time <= form.start_time) return toast('종료 시간은 시작 시간 이후로 선택해주세요.', false)
        setSaving(true)
        const row = {
            title: form.title,
            start_date: form.start_date,
            end_date: form.end_date || form.start_date,
            start_time: form.useTime && form.start_time ? form.start_time : null,
            end_time: form.useTime && form.end_time ? form.end_time : null,
            type: form.type,
            parent_visible: form.targetParent,
            student_visible: form.targetStudent,
            memo: form.memo || null,
            created_by: teacher?.userId,
        }
        const { error } = editId
            ? await supabase.from('events').update(row).eq('id', editId)
            : await supabase.from('events').insert(row)
        if (error) { toast('저장 실패: ' + error.message, false); setSaving(false); return }
        toast(editId ? '수정되었습니다.' : '등록되었습니다.')
        setSaving(false); setModal(false)
        await load()
    }

    async function del(id: number, ev: React.MouseEvent) {
        ev.stopPropagation()
        if (!confirm('삭제하시겠습니까?')) return
        const { error } = await supabase.from('events').delete().eq('id', id)
        if (error) return toast('삭제하지 못했습니다. 다시 시도해주세요.', false)
        toast('삭제되었습니다.')
        await load()
    }

    async function delCancellation(id: number) {
        if (!confirm('휴강 등록을 취소하시겠습니까?')) return
        const { error } = await supabase.from('class_cancellations').delete().eq('id', id)
        if (error) return toast('삭제하지 못했습니다. 다시 시도해주세요.', false)
        toast('휴강 등록이 취소되었습니다.')
        await load()
    }

    function moveMo(d: number) {
        setLoading(true)
        setLoadError(false)
        let m = mo + d, y = yr
        if (m < 0) { m = 11; y-- }
        if (m > 11) { m = 0; y++ }
        setMo(m); setYr(y); setSelectedDate(null)
    }

    const dim = new Date(yr, mo + 1, 0).getDate()   // days in month
    const fd = new Date(yr, mo, 1).getDay()         // first day of week
    const pmd = new Date(yr, mo, 0).getDate()        // prev month last day
    const trail = (7 - ((fd + dim) % 7)) % 7
    const canWrite = role ? can.writeSchedule(role as Role) : false

    // 특정 날짜에 걸치는 이벤트 반환
    // end_date null 이면 start_date 당일만
    function dayEvts(ds: string) {
        return evts.filter(e => {
            const end = e.end_date ?? e.start_date
            return e.start_date <= ds && end >= ds
        })
    }
    function dayNotices(ds: string) {
        return attNotices.filter(n => n.date === ds)
    }
    function dayCancellations(ds: string) {
        return cancellations.filter(c => c.cancel_date === ds)
    }
    const visibleEvents = selectedDate ? dayEvts(selectedDate) : evts
    const { holidays: publicHolidays, fallback: holidayFallback } = usePublicHolidays(yr)
    const visibleNotices = selectedDate ? dayNotices(selectedDate) : attNotices
    const visibleCancellations = selectedDate ? dayCancellations(selectedDate) : cancellations
    const listTitle = selectedDate ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일` : `${mo + 1}월 전체`
    const classNameById = Object.fromEntries(classesList.map(c => [c.id, c.name]))

    return (
        <div className="schedule-page" style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .schedule-page .cd{min-height:${mobileMode ? 46 : 72}px;background:#fff;border:1px solid ${bd};border-radius:8px;padding:${mobileMode ? '3px' : '6px'};cursor:pointer;transition:background .15s;}
        .schedule-page .cd:hover{background:var(--ui-hover);}
        .schedule-page .cd.tod{border-color:${navy};background:${navyM};}
        .schedule-page .cd.om{opacity:.4;cursor:default;}
        .schedule-page .cd.om:hover{background:#fff;}
        .schedule-page .cd.hol{background:rgba(222,53,11,.05);}
        ${mobileMode ? `
        /* 학부모 학원일정 캘린더와 동일하게 — 흰 박스/테두리 없는 플랫한 셀 디자인 */
        .schedule-page .cd{background:none;border:none;border-radius:8px;}
        .schedule-page .cd:hover{background:var(--ui-hover);}
        .schedule-page .cd.tod{border-color:transparent;}
        .schedule-page .cd.om:hover{background:none;}
        .schedule-page .cd.hol{background:none;}
        .schedule-page .bnav{border:none;background:none;color:${tx2};font-size:18px;padding:4px 10px;}
        .schedule-page .bnav:hover{color:${navy};}
        ` : ''}
        .schedule-page .ce{display:flex;align-items:center;gap:4px;width:100%;min-width:0;border:0;text-align:left;font-family:inherit;font-size:11px;line-height:1.5;padding:3px 5px;border-radius:4px;margin-bottom:3px;cursor:pointer;}
        .schedule-page .ce > svg{display:block;flex:0 0 auto;}
        .schedule-page .ce > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .schedule-page .cd{min-width:0;position:relative;}
        .schedule-page .cd.selected{border-color:var(--ui-primary);box-shadow:inset 0 0 0 1px var(--ui-primary);background:var(--ui-bg);}
        .schedule-page .day-select{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:28px;background:none;border:0;border-radius:4px;color:inherit;font:inherit;text-align:left;cursor:pointer;margin-bottom:3px;}
        .schedule-page .day-select:focus-visible{outline-offset:-2px;}
        .schedule-page .calendar-more{display:block;width:100%;border:0;background:none;color:var(--ui-primary);font-size:11px;padding:4px 0;text-align:left;cursor:pointer;}
        .schedule-page .calendar-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
        @media(max-width:700px){.schedule-page{padding:16px 12px 88px !important;}.schedule-page .ce{font-size:10px;padding:2px;gap:2px;}.schedule-page .ce > svg{width:10px;height:10px;}}
        .schedule-page .ce.normal{background:${navyM};color:${navy};}
        .schedule-page .ce.holiday{background:rgba(222,53,11,.15);color:${re};}
        .schedule-page .ce.absence{background:var(--ui-danger-bg);color:var(--ui-danger);font-weight:600;cursor:pointer;}
        .schedule-page .ce.late{background:var(--ui-warning-bg);color:var(--ui-warning);font-weight:600;cursor:pointer;}
        .schedule-page .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
        .schedule-page .bgold:hover{background:${goldL};}
        .schedule-page .bout{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .schedule-page .bout:hover{border-color:${navy};color:${navy};}
        .schedule-page .bsm{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .schedule-page .bdng{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
        .schedule-page .bnav{padding:5px 12px;border-radius:8px;font-size:12px;border:1px solid ${bd};background:#fff;cursor:pointer;color:${tx2};font-family:inherit;}
        .schedule-page .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
        .schedule-page .fi:focus{border-color:${navy};}
        .schedule-page .rr{display:flex;gap:16px;margin-top:6px;}
        .schedule-page .rr label{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;}
        .schedule-page .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
      `}</style>

            {notif && (
                <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 14px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2, color: tx, fontSize: 13 }}>{notif.ok ? '완료' : '알림'}</div>
                    <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
                </div>
            )}

            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mobileMode ? 14 : 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>학원 일정</h1>
                    {!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>날짜를 선택하면 일정과 결석·지각을 함께 확인할 수 있습니다</p>}
                </div>
                {canWrite && (
                    <button className="bgold" onClick={() => openAdd(selectedDate ?? kstDateStr())}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                        일정 추가
                    </button>
                )}
            </div>

            {/* 달력 */}
            <p style={{ fontSize: 12, color: tx2, marginBottom: 10 }}>공휴일은 학원 휴강 여부와 별개입니다.{holidayFallback && (publicHolidays ? ' 현재 저장된 공휴일 자료를 표시합니다.' : ' 공휴일 정보를 불러오지 못했습니다.')}</p>
            {loadError && <div role="alert" style={{ background: rbg, color: re, padding: 14, borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                일정을 불러오지 못했습니다.<button className="bout" onClick={() => { setLoading(true); setLoadError(false); void load() }}>다시 불러오기</button>
            </div>}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 12 : 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: mobileMode ? 12 : 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <button className="bnav" aria-label="이전 달" onClick={() => moveMo(-1)}>{mobileMode ? '‹' : '◀'}</button>
                    <span style={{ fontSize: 16, fontWeight: 700, color: tx }}>{yr}년 {mo + 1}월</span>
                    <button className="bnav" aria-label="다음 달" onClick={() => moveMo(1)}>{mobileMode ? '›' : '▶'}</button>
                </div>
                <div className="calendar-tools" style={{ marginBottom: 14 }}>
                    <button className="bout" onClick={() => { const now = kstNow(); if (yr !== now.getFullYear() || mo !== now.getMonth()) { setLoading(true); setLoadError(false) }; setYr(now.getFullYear()); setMo(now.getMonth()); setSelectedDate(kstDateStr()) }}>오늘</button>
                    <button className="bout" aria-pressed={selectedDate === null} onClick={() => setSelectedDate(null)}>월 전체 보기</button>
                    <span style={{ fontSize: 12, color: tx2 }} aria-live="polite">{listTitle}{selectedDate ? ' 선택됨' : ''}</span>
                </div>

                {mobileMode && <CompactMonthCalendar year={yr} month={mo} selectedDate={selectedDate}
                    holidays={publicHolidays} showNavigation={false} onSelectDate={setSelectedDate}
                    getDayInfo={date => {
                        const events = dayEvts(date)
                        const notices = dayNotices(date)
                        return {
                            holiday: events.some(event => event.type === 'holiday'),
                            markers: [
                                ...events.map(event => event.type === 'holiday' ? re : navy),
                                ...notices.map(notice => notice.type === 'absence' ? re : 'var(--ui-warning)'),
                            ],
                            description: `일정 ${events.length}건, 결석·지각 ${notices.length}건`,
                        }
                    }} />}
                {!mobileMode && <>
                {/* 요일 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                    {DOW.map((d, i) => (
                        <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i === 0 ? re : i === 6 ? saturday : tx3 }}>{d}</div>
                    ))}
                </div>

                {/* 날짜 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                    {/* 이전달 날짜 */}
                    {Array.from({ length: fd }).map((_, i) => (
                        <div key={'p' + i} className="cd om">
                            <div style={{ fontSize: 12, color: tx3 }}>{pmd - fd + 1 + i}</div>
                        </div>
                    ))}

                    {/* 이번달 날짜 */}
                    {Array.from({ length: dim }).map((_, i) => {
                        const day = i + 1
                        const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dow = (fd + i) % 7
                        const isTod = ds === kstDateStr()
                        const de = dayEvts(ds)
                        const publicHoliday = publicHolidays?.find(h => h.date === ds)
                        const isHol = !!publicHoliday || de.some(e => e.type === 'holiday')
                        let cls = 'cd'
                        if (isTod) cls += ' tod'
                        if (isHol) cls += ' hol'
                        if (selectedDate === ds) cls += ' selected'
                        const nc = dow === 0 ? re : dow === 6 ? saturday : tx
                        const dNotices = dayNotices(ds)
                        return (
                            <div key={day} className={cls} onClick={() => setSelectedDate(ds)}
                                style={mobileMode ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0 6px' } : undefined}>
                                <button className="day-select" aria-pressed={selectedDate === ds} aria-label={`${mo + 1}월 ${day}일${publicHoliday ? `, ${publicHoliday.name}` : ''}, 일정 ${de.length}건, 결석·지각 ${dNotices.length}건`} onClick={() => setSelectedDate(ds)} style={{ justifyContent: 'flex-start', gap: 4 }}>
                                <span style={{
                                    fontSize: 12, fontWeight: isTod || isHol ? 700 : 500, marginBottom: mobileMode ? 0 : 2,
                                    color: isHol ? re : nc,
                                    width: 20, height: 20, lineHeight: '20px', textAlign: 'center',
                                    borderRadius: '50%', background: 'transparent', flexShrink: 0,
                                }}>{day}</span>
                                {publicHoliday && <span title={publicHoliday.name} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: re, lineHeight: '14px' }}>{publicHoliday.name}</span>}
                                {isTod && !mobileMode && !publicHoliday && <span style={{ fontSize: 10, color: navy }}>오늘</span>}
                                </button>
                                {mobileMode ? (
                                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {de.slice(0, 3).map(e => (
                                            <div key={'e' + e.id} style={{ width: 4, height: 4, borderRadius: '50%', background: e.type === 'holiday' ? re : navy }} />
                                        ))}
                                        {dNotices.slice(0, 3).map(n => (
                                            <div key={'n' + n.id} style={{ width: 4, height: 4, borderRadius: '50%', background: n.type === 'absence' ? 'var(--ui-danger)' : 'var(--ui-warning)' }} />
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {dNotices.slice(0, 3).map(n => (
                                            <button key={'n' + n.id} className={`ce ${n.type}`}
                                                onClick={ev => { ev.stopPropagation(); setSelectedDate(ds) }}
                                                title={`${n.type === 'absence' ? '결석' : '지각'} 등록 - ${studentsMap[n.student_id] ?? '학생'}${n.reason ? ` (${n.reason})` : ''}`}>
                                                {n.type === 'late' && <IconClock size={11} strokeWidth={2} />}<span>{studentsMap[n.student_id] ?? '학생'} · {n.type === 'absence' ? '결석' : '지각'}</span>
                                            </button>
                                        ))}
                                        {de.slice(0, Math.max(0, 3 - dNotices.length)).map(e => (
                                            <button key={e.id} className={`ce ${e.type}`}
                                                onClick={ev => { ev.stopPropagation(); setSelectedDate(ds) }}
                                                title={e.title + (e.start_time ? ' ' + e.start_time.slice(0, 5) : '')}>
                                                {!(e.parent_visible && e.student_visible) && <IconLock size={11} strokeWidth={2} />}<span>{e.start_time ? `${e.start_time.slice(0, 5)} ` : ''}{e.title}</span>
                                            </button>
                                        ))}
                                        {de.length + dNotices.length > 3 && <button className="calendar-more" onClick={() => setSelectedDate(ds)}>+{de.length + dNotices.length - 3}건 더보기</button>}
                                    </>
                                )}
                            </div>
                        )
                    })}

                    {/* 다음달 날짜 */}
                    {Array.from({ length: trail }).map((_, i) => (
                        <div key={'n' + i} className="cd om">
                            <div style={{ fontSize: 12, color: tx3 }}>{i + 1}</div>
                        </div>
                    ))}
                </div>
                </>}
            </div>

            {/* 이번달 목록 */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 14 : 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: tx, marginBottom: 14 }}>{listTitle} 일정 목록</h2>
                {loading ? (
                    <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
                ) : loadError ? <p style={{ color: re, fontSize: 13 }}>불러오기 실패로 일정을 확인할 수 없습니다.</p> : visibleEvents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: tx3 }}>
                        <p style={{ fontSize: 14 }}>{selectedDate ? '선택한 날짜에' : '이번 달에'} 일정이 없습니다</p>
                    </div>
                ) : visibleEvents.map(e => (
                    <div key={e.id} style={{ padding: '10px 0', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: mobileMode ? 'wrap' : 'nowrap' }}>
                        <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 3, flexShrink: 0,
                            background: e.type === 'holiday' ? 'rgba(222,53,11,.15)' : navyM,
                            color: e.type === 'holiday' ? re : navy
                        }}>
                            {e.type === 'holiday' ? '휴원' : '일정'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: tx, flex: 1 }}>{e.title}</span>
                        <span style={{ fontSize: 12, color: tx3, whiteSpace: 'nowrap' }}>
                            {e.start_date.slice(5).replace('-', '/')}
                            {e.end_date && e.end_date !== e.start_date ? ` ~ ${e.end_date.slice(5).replace('-', '/')}` : ''}
                            {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ''}
                        </span>
                        {!(e.parent_visible && e.student_visible) && (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: rbg, color: re, whiteSpace: 'nowrap' }}>
                                {!e.parent_visible && !e.student_visible ? '비공개' : e.parent_visible ? '학부모만 공개' : '학생만 공개'}
                            </span>
                        )}
                        {canWrite && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <button className="bsm" onClick={ev => openEdit(e, ev)}>수정</button>
                                <button className="bdng" onClick={ev => del(e.id, ev)}>삭제</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 이번달 결석·지각 목록 */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 14 : 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginTop: mobileMode ? 12 : 18 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: tx, marginBottom: 14 }}>{listTitle} 결석·지각 목록</h2>
                {loading ? (
                    <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
                ) : loadError ? <p style={{ color: re, fontSize: 13 }}>불러오기 실패로 결석·지각을 확인할 수 없습니다.</p> : visibleNotices.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: tx3 }}>
                        <p style={{ fontSize: 14 }}>{selectedDate ? '선택한 날짜에' : '이번 달에'} 결석·지각 등록이 없습니다</p>
                    </div>
                ) : [...visibleNotices].sort((a, b) => a.date.localeCompare(b.date)).map(n => (
                    <div key={n.id} style={{ padding: '12px 0', borderBottom: `1px solid ${bd}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 3, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
                            background: n.type === 'late' ? 'var(--ui-warning-bg)' : 'var(--ui-danger-bg)',
                            color: n.type === 'late' ? 'var(--ui-warning)' : 'var(--ui-danger)',
                        }}>
                            {n.type === 'late' && <IconClock size={9} />}{n.type === 'late' ? '지각' : '결석'}
                        </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: tx, minWidth: 0, overflowWrap: 'anywhere' }}>{studentsMap[n.student_id] ?? '학생'}</span>
                          <span style={{ fontSize: 12, color: tx3, whiteSpace: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>{n.date.slice(5).replace('-', '/')}</span>
                        </div>
                        {n.reason && <p style={{ fontSize: 12, color: tx2, lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.reason}</p>}
                    </div>
                ))}
            </div>

            {/* 이번달 휴강 목록 */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 14 : 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginTop: mobileMode ? 12 : 18 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: tx, marginBottom: 14 }}>{listTitle} 휴강 목록</h2>
                {loading ? (
                    <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
                ) : loadError ? <p style={{ color: re, fontSize: 13 }}>불러오기 실패로 휴강 등록을 확인할 수 없습니다.</p> : visibleCancellations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: tx3 }}>
                        <p style={{ fontSize: 14 }}>{selectedDate ? '선택한 날짜에' : '이번 달에'} 등록된 휴강이 없습니다</p>
                    </div>
                ) : [...visibleCancellations].sort((a, b) => a.cancel_date.localeCompare(b.cancel_date)).map(c => (
                    <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: mobileMode ? 'wrap' : 'nowrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, flexShrink: 0, background: 'rgba(222,53,11,.15)', color: re }}>휴강</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: tx, flex: 1 }}>{classNameById[c.class_id] ?? '반 정보 없음'}</span>
                        {c.memo && <span style={{ fontSize: 12, color: tx2 }}>{c.memo}</span>}
                        <span style={{ fontSize: 12, color: tx3, whiteSpace: 'nowrap' }}>{c.cancel_date.slice(5).replace('-', '/')}</span>
                        {canWrite && <button className="bdng" onClick={() => delCancellation(c.id)}>삭제</button>}
                    </div>
                ))}
            </div>

            {/* 모달 */}
            {modal && (
                <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
                        <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{editId ? '일정 수정' : '일정 추가'}</span>
                            <button onClick={() => setModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
                        </div>
                        <div style={{ padding: '18px 22px' }}>

                            {!editId && (
                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">종류</label>
                                    <div className="rr">
                                        <label><input type="radio" checked={form.mode === 'event'} onChange={() => setForm(f => ({ ...f, mode: 'event' }))} />일반</label>
                                        <label><input type="radio" checked={form.mode === 'cancel'} onChange={() => setForm(f => ({ ...f, mode: 'cancel' }))} />휴강 등록</label>
                                    </div>
                                </div>
                            )}

                            {form.mode === 'event' ? <>
                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">제목</label>
                                    <input className="fi" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="일정 제목" />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                    <div>
                                        <label className="lb">시작 날짜</label>
                                        <input type="date" className="fi" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="lb">종료 날짜 <span style={{ fontWeight: 400, color: tx3 }}>(당일이면 동일)</span></label>
                                        <input type="date" className="fi" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">시간 설정</label>
                                    <div className="rr">
                                        <label>
                                            <input type="radio" checked={!form.useTime} onChange={() => setForm(f => ({ ...f, useTime: false, start_time: '', end_time: '' }))} />
                                            설정 안 함
                                        </label>
                                        <label>
                                            <input type="radio" checked={form.useTime} onChange={() => setForm(f => ({ ...f, useTime: true }))} />
                                            시간 지정
                                        </label>
                                    </div>
                                </div>

                                {form.useTime && (
                                    <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                        <div>
                                            <label className="lb">시작 시간</label>
                                            <input type="time" className="fi" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="lb">종료 시간</label>
                                            <input type="time" className="fi" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">공개 대상</label>
                                    <div className="rr">
                                        <label><input type="checkbox" checked={form.targetParent} onChange={() => setForm(f => ({ ...f, targetParent: !f.targetParent }))} />학부모</label>
                                        <label><input type="checkbox" checked={form.targetStudent} onChange={() => setForm(f => ({ ...f, targetStudent: !f.targetStudent }))} />학생</label>
                                    </div>
                                </div>
                            </> : <>
                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">휴강 날짜</label>
                                    <input type="date" className="fi" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: e.target.value }))} />
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label className="lb">휴강할 반 선택</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                        <button type="button" className="bout" aria-pressed={classesList.length > 0 && classesList.every(c => form.cancelClassIds.includes(c.id))} onClick={toggleCancelAll}>전체</button>
                                        {WEEK_ORDER.map(d => {
                                            const ids = classIdsOnDay(d)
                                            const pressed = ids.length > 0 && ids.every(id => form.cancelClassIds.includes(id))
                                            return <button type="button" key={d} className="bout" aria-pressed={pressed} onClick={() => toggleCancelDay(d)}>{d}</button>
                                        })}
                                    </div>
                                    {classesList.length === 0 ? (
                                        <p style={{ fontSize: 12, color: tx3 }}>등록된 반이 없습니다.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: `1px solid ${bd}`, borderRadius: 8, padding: 10 }}>
                                            {classesList.map(c => (
                                                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={form.cancelClassIds.includes(c.id)} onChange={() => toggleCancelClass(c.id)} />
                                                    {c.name} <span style={{ color: tx3, fontSize: 11 }}>({c.days || '요일 미설정'})</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>}

                            <div>
                                <label className="lb">메모 (선택)</label>
                                <input className="fi" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="추가 메모" />
                            </div>
                        </div>

                        <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="bout" onClick={() => setModal(false)}>취소</button>
                            <button className="bgold" onClick={save} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
                                {saving ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
