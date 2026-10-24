import styles from './StudentContactDetails.module.css'

export function StudentContactDetails({ studentNumber, parentNumber, onSaveStudent, onSaveParent }: {
  studentNumber:React.ReactNode; parentNumber:React.ReactNode; onSaveStudent?:() => void; onSaveParent?:() => void
}) {
  return <section className={styles.card} aria-label="연락처">
    <h3 className={styles.title}>연락처</h3>
    <div className={styles.contacts}>
      {[
        { label:'학생',number:studentNumber,onSave:onSaveStudent },
        { label:'학부모',number:parentNumber,onSave:onSaveParent },
      ].map(item => <div key={item.label} className={styles.contactRow}>
        <div className={styles.contactInfo}><p className={styles.label}>{item.label}</p><div className={styles.value}>{item.number}</div></div>
        {item.onSave && <button type="button" className={styles.save} aria-label={`${item.label} 연락처 저장`} onClick={item.onSave}>연락처 저장</button>}
      </div>)}
    </div>
    {(onSaveStudent || onSaveParent) && <p className={styles.help}>저장한 .vcf 파일을 열어 휴대폰 연락처에 추가하세요.</p>}
  </section>
}

export function PinSettingsCard({ title, onReset, resetting = false }: { title:string; onReset:() => void; resetting?:boolean }) {
  return <section className={styles.card} aria-label={title}>
    <h3 className={styles.title}>{title}</h3>
    <p className={styles.description}>보안을 위해 암호화 저장되어 현재 PIN은 확인할 수 없습니다.</p>
    <div className={styles.pinActions}><button type="button" className={styles.reset} disabled={resetting} onClick={onReset} aria-label={`${title} 초기화`}>{resetting ? '초기화 중...' : 'PIN 초기화'}</button></div>
  </section>
}
