'use client'
import { useEffect, useId, useRef } from 'react'
import styles from './ContactDialog.module.css'

export default function ContactDialog({ title, description, onClose, children, footer }: {
  title: string; description?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    heading.current?.focus({ preventScroll:true })
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={id} aria-describedby={description ? `${id}-description` : undefined}
    onCancel={onClose} onClick={e => {
      e.stopPropagation()
      if (e.target !== e.currentTarget) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose()
    }}>
    <header className={styles.header}>
      <div className={styles.heading}>
        <h2 id={id} ref={heading} tabIndex={-1}>{title}</h2>
        {description && <p id={`${id}-description`}>{description}</p>}
      </div>
      <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div className={styles.body}>{children}</div>
    {footer && <footer className={styles.footer}>{footer}</footer>}
  </dialog>
}
