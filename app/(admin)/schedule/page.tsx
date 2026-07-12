'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can, Role } from '@/lib/permissions'
import { kstDateStr, kstNow } from '@/lib/kst'

type Evt = {
    id: number
    title: string
    start_date: string
    end_date: string | null
    start_time: string | null
    end_time: string | null
    type: 'normal' | 'holiday'
    parent_visible: boolean
    memo: string | null
}

type FormState = {
  title: string; start_date: string; end_date: string
  start_time: string; end_time: string
  type: 'normal' | 'holiday'
  parent_visible: boolean; memo: string; useTime: boolean
}

const BLANK: FormState = {
    title: '', start_date: '', end_date: '',
    start_time: '', end_time: '',
    type: 'normal',
    parent_visible: true, memo: '', useTime: false,
}

const navy = '#0D2A5E'
const navyDk = '#071A3E'
const navyM = '#E8EEF8'
const gold = '#D87E13'
const goldL = '#F09830'
const bg = '#F5F7FA'
const bd = '#DDE3EE'
const tx = '#0D1B36'
const tx2 = '#4B5C7E'
const tx3 = '#96A4BF'
const re = '#C0392B'
const rbg = '#FDECEA'
const gr = '#1A7F4E'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function SchedulePage() {
    const { teacher, role } = useAuth()
    const [evts, setEvts] = useState<Evt[]>([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState<FormState>({ ...BLANK })
    const [editId, setEditId] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [yr, setYr] = useState(kstNow().getFullYear())
    const [mo, setMo] = useState(kstNow().getMonth())  // 0-based
    const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

    useEffect(() => { load() }, [yr, mo])

    async function load() {
        setLoading(true)

        const ym = `${yr}-${String(mo + 1).padStart(2, '0')}`
        const from = `${ym}-01`

        // ✅ 해당 월의 실제 마지막 날 계산 (6월=30일, 7월=31일 등 정확하게)
        const lastDay = new Date(yr, mo + 1, 0).getDate()
        const to = `${ym}-${String(lastDay).padStart(2, '0')}`

        // ① 이번달에 시작하는 이벤트
        const { data: A } = await supabase
            .from('events').select('*')
            .gte('start_date', from)
            .lte('start_date', to)

        // ② start_date < from 이면서 end_date >= from 인 이벤트 (이번달에 걸침)
        const { data: B } = await supabase
            .from('events').select('*')
            .lt('start_date', from)
            .gte('end_date', from)

        // 합치고 중복 제거
        const map = new Map<number, Evt>()
        for (const e of [...(A ?? []), ...(B ?? [])]) map.set(e.id, e)
        setEvts([...map.values()].sort((a, b) => a.start_date.localeCompare(b.start_date)))
        setLoading(false)
    }

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
            parent_visible: e.parent_visible,
            memo: e.memo ?? '',
            useTime: !!(e.start_time || e.end_time),
        })
        setModal(true)
    }

    async function save() {
        if (!form.title.trim()) return toast('제목을 입력하세요.', false)
        if (!form.start_date) return toast('시작 날짜를 입력하세요.', false)
        setSaving(true)
        const row = {
            title: form.title,
            start_date: form.start_date,
            end_date: form.end_date || form.start_date,
            start_time: form.useTime && form.start_time ? form.start_time : null,
            end_time: form.useTime && form.end_time ? form.end_time : null,
            type: form.type,
            parent_visible: form.parent_visible,
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
        await supabase.from('events').delete().eq('id', id)
        toast('삭제되었습니다.', false)
        await load()
    }

    function moveMo(d: number) {
        let m = mo + d, y = yr
        if (m < 0) { m = 11; y-- }
        if (m > 11) { m = 0; y++ }
        setMo(m); setYr(y)
    }

    const today = kstNow()
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

    return (
        <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .cd{min-height:72px;background:#fff;border:1px solid ${bd};border-radius:8px;padding:6px;cursor:pointer;transition:background .15s;}
        .cd:hover{background:rgba(13,42,94,.03);}
        .cd.tod{border-color:${navy};background:${navyM};}
        .cd.om{opacity:.4;cursor:default;}
        .cd.om:hover{background:#fff;}
        .cd.hol{background:rgba(222,53,11,.05);}
        .ce{font-size:10px;padding:1px 5px;border-radius:3px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
        .ce.normal{background:${navyM};color:${navy};}
        .ce.holiday{background:rgba(222,53,11,.15);color:${re};}
        .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
        .bgold:hover{background:${goldL};}
        .bout{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .bout:hover{border-color:${navy};color:${navy};}
        .bsm{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .bdng{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
        .bnav{padding:5px 12px;border-radius:8px;font-size:12px;border:1px solid ${bd};background:#fff;cursor:pointer;color:${tx2};font-family:inherit;}
        .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
        .fi:focus{border-color:${navy};}
        .rr{display:flex;gap:16px;margin-top:6px;}
        .rr label{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;}
        .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
      `}</style>

            {notif && (
                <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 14px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2, color: tx, fontSize: 13 }}>{notif.ok ? '완료' : '알림'}</div>
                    <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
                </div>
            )}

            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 21, fontWeight: 700, color: tx }}>학원 일정</h1>
                    <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>달력에서 일정을 확인하고 추가하세요</p>
                </div>
                {canWrite && (
                    <button className="bgold" onClick={() => openAdd()}>
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                        일정 추가
                    </button>
                )}
            </div>

            {/* 달력 */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <button className="bnav" onClick={() => moveMo(-1)}>◀</button>
                    <span style={{ fontSize: 16, fontWeight: 700, color: tx }}>{yr}년 {mo + 1}월</span>
                    <button className="bnav" onClick={() => moveMo(1)}>▶</button>
                </div>

                {/* 요일 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                    {DOW.map((d, i) => (
                        <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i === 0 ? re : i === 6 ? navy : tx3 }}>{d}</div>
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
                        const isHol = de.some(e => e.type === 'holiday')
                        let cls = 'cd'
                        if (isTod) cls += ' tod'
                        if (isHol) cls += ' hol'
                        const nc = dow === 0 || isHol ? re : dow === 6 ? navy : tx
                        return (
                            <div key={day} className={cls} onClick={() => canWrite && openAdd(ds)}>
                                <div style={{ fontSize: 12, fontWeight: isTod ? 700 : 500, marginBottom: 2, color: nc }}>{day}</div>
                                {de.map(e => (
                                    <div key={e.id} className={`ce ${e.type}`}
                                        onClick={ev => { ev.stopPropagation(); canWrite && openEdit(e, ev) }}
                                        title={e.title + (e.start_time ? ' ' + e.start_time.slice(0, 5) : '')}>
                                        {e.start_time && <span style={{ opacity: .7, fontSize: 9 }}>{e.start_time.slice(0, 5)} </span>}
                                        {!e.parent_visible && '🔒 '}{e.title}
                                    </div>
                                ))}
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
            </div>

            {/* 이번달 목록 */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 22, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: tx, marginBottom: 14 }}>{mo + 1}월 일정 목록</h2>
                {loading ? (
                    <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
                ) : evts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: tx3 }}>
                        <p style={{ fontSize: 14 }}>이번달 일정이 없습니다</p>
                    </div>
                ) : evts.map(e => (
                    <div key={e.id} style={{ padding: '10px 0', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'center', gap: 10 }}>
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
                        {!e.parent_visible && (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: rbg, color: re, whiteSpace: 'nowrap' }}>비공개</span>
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

            {/* 모달 */}
            {modal && (
                <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
                        <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{editId ? '일정 수정' : '일정 추가'}</span>
                            <button onClick={() => setModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
                        </div>
                        <div style={{ padding: '18px 22px' }}>

                            <div style={{ marginBottom: 14 }}>
                                <label className="lb">제목</label>
                                <input className="fi" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="일정 제목" />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
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
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                                <div>
                                    <label className="lb">종류</label>
                                    <div className="rr">
                                        <label><input type="radio" checked={form.type === 'normal'} onChange={() => setForm(f => ({ ...f, type: 'normal' }))} />일반</label>
                                        <label><input type="radio" checked={form.type === 'holiday'} onChange={() => setForm(f => ({ ...f, type: 'holiday' }))} />쉬는 날 🔴</label>
                                    </div>
                                </div>
                                <div>
                                    <label className="lb">학부모 열람</label>
                                    <div className="rr">
                                        <label>
                                            <input type="radio" checked={form.parent_visible} onChange={() => setForm(f => ({ ...f, parent_visible: true }))} />
                                            <span style={{ color: gr, fontWeight: 500 }}>공개</span>
                                        </label>
                                        <label>
                                            <input type="radio" checked={!form.parent_visible} onChange={() => setForm(f => ({ ...f, parent_visible: false }))} />
                                            <span style={{ color: re, fontWeight: 500 }}>비공개</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

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