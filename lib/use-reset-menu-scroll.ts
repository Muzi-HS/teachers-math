'use client'

import { RefObject, useLayoutEffect } from 'react'

// App Router가 레이아웃을 유지하므로 메뉴 간 이동 시 스크롤 컨테이너도 유지된다.
export function useResetMenuScroll(pathname: string, scrollContainer?: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return
    if (scrollContainer) scrollContainer.current?.scrollTo({ top: 0, behavior: 'instant' })
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, scrollContainer, enabled])
}
