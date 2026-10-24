'use client'
import ContactDialog from './ContactDialog'
import styles from './StudentContactDialogs.module.css'

export function PhoneContactDialog({ label, display, number, onClose }: { label:string; display:string; number:string; onClose:() => void }) {
  return <ContactDialog title={label} description="연락 방법을 선택하세요." onClose={onClose}>
    <div className={styles.phoneCard}><p>전화번호</p><strong>{display}</strong></div>
    <div className={styles.actions}>
      <a className={styles.primary} href={`tel:${number}`} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m7 3 3 5-2 2a14 14 0 0 0 6 6l2-2 5 3-1 3c-1 3-8 0-12-4S1 5 4 4l3-1Z" /></svg>전화 걸기</a>
      <a className={styles.secondary} href={`sms:${number}`} onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-10a9 9 0 1 1 18-1Z" /><path d="M7 10h10M7 14h6" /></svg>문자 보내기</a>
    </div>
  </ContactDialog>
}

type ContactStudent = { id:number; name:string; school_type:string | null }
export function ContactSaveDialog({ students, selectedIds, target, onTargetChange, onSelectionChange, onSave, onClose }: {
  students:ContactStudent[]; selectedIds:number[]; target:string; onTargetChange:(target:string) => void;
  onSelectionChange:(ids:number[]) => void; onSave:(all:boolean) => void; onClose:() => void
}) {
  const selectedCount = students.filter(s => selectedIds.includes(s.id)).length
  const allSelected = students.length > 0 && selectedCount === students.length
  return <ContactDialog title="연락처 저장" description="현재 검색·필터 결과에서 저장할 학생을 선택하세요." onClose={onClose} footer={
    <div className={styles.saveButtons}>
      <button type="button" className={styles.secondary} disabled={!students.length} onClick={() => onSave(true)}>전체 저장</button>
      <button type="button" className={styles.primary} disabled={!selectedCount} onClick={() => onSave(false)}>선택 저장{selectedCount > 0 ? ` (${selectedCount}명)` : ''}</button>
    </div>
  }>
    <span className={styles.fieldLabel}>저장할 연락처</span>
    <div className={styles.targets} role="group" aria-label="저장할 연락처 종류">
      {([['both','학생 + 학부모'],['student','학생만'],['parent','학부모만']] as const).map(([value,label]) => <button type="button" key={value} className={styles.target} aria-pressed={target === value} onClick={() => onTargetChange(value)}>{label}</button>)}
    </div>
    <div className={styles.selectionHeader}><strong>학생 선택 <span style={{ color:'var(--ui-text-3)',fontWeight:400 }}>· {students.length}명</span></strong><span>{selectedCount}명 선택</span></div>
    <div className={styles.list}>
      <label className={`${styles.row} ${styles.selectAll}`}><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = selectedCount > 0 && !allSelected }} onChange={() => onSelectionChange(allSelected ? [] : students.map(s => s.id))} />전체 선택</label>
      {students.map(s => <label key={s.id} className={styles.row}>
        <input type="checkbox" aria-label={`${s.name} 연락처 선택`} checked={selectedIds.includes(s.id)} onChange={() => onSelectionChange(selectedIds.includes(s.id) ? selectedIds.filter(id => id !== s.id) : [...selectedIds,s.id])} />
        <span>{s.name}</span><span className={styles.school}>{s.school_type}</span>
      </label>)}
    </div>
    <p className={styles.help}>내려받은 .vcf 파일을 열어 휴대폰 연락처에 추가하세요.<br />번호가 없거나 잘못된 항목은 제외됩니다.</p>
  </ContactDialog>
}
