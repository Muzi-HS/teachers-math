'use client'
import { useEffect, useRef } from 'react'
import 'quill/dist/quill.snow.css'

type Props = {
  value: string
  onChange: (html: string) => void
  onImageUpload: (file: File) => Promise<string | null>
  placeholder?: string
  minHeight?: number
}

// Quill을 직접 초기화하는 얇은 래퍼 — react-quill 계열 패키지는 React 19와
// 호환성 문제가 있어 vanilla quill을 ref에 직접 붙여서 사용한다.
export default function RichTextEditor({ value, onChange, onImageUpload, placeholder, minHeight = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onImageUploadRef = useRef(onImageUpload)
  onImageUploadRef.current = onImageUpload

  useEffect(() => {
    let cancelled = false
    let quill: any = null

    async function init() {
      const { default: Quill } = await import('quill')
      if (cancelled || !containerRef.current) return

      quill = new Quill(containerRef.current, {
        theme: 'snow',
        placeholder: placeholder ?? '',
        modules: {
          toolbar: [
            [{ size: ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            ['image'],
            ['clean'],
          ],
        },
      })

      if (value) quill.clipboard.dangerouslyPasteHTML(value)

      quill.on('text-change', () => {
        const html = quill.root.innerHTML
        onChangeRef.current(html === '<p><br></p>' ? '' : html)
      })

      // 이미지 버튼 — base64로 본문에 박아넣지 않고 Storage에 업로드 후 URL을 삽입
      const toolbar = quill.getModule('toolbar')
      toolbar.addHandler('image', () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          const url = await onImageUploadRef.current(file)
          if (!url) return
          const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 }
          quill.insertEmbed(range.index, 'image', url, 'user')
          quill.setSelection(range.index + 1, 0)
        }
        input.click()
      })
    }

    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <style>{`
        .ql-editor img { max-width: 100%; height: auto; }
        .ql-container { max-width: 100%; }
        .ql-editor { max-width: 100%; overflow-x: hidden; word-break: break-word; }
        .ql-toolbar.ql-snow { flex-wrap: wrap; }
      `}</style>
      <div ref={containerRef} style={{ background: '#fff', minHeight, maxWidth: '100%' }} />
    </div>
  )
}
