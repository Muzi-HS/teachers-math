import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveNoticeTargetIds, type NoticeTargetMode } from './notices'

export type NoticeSaveInput = {
  id: number | null
  title: string
  content: string
  pinned: boolean
  targetMode: NoticeTargetMode
  studentIds: number[]
}

/** 본문과 공개 대상을 단일 트랜잭션으로 저장한다. 실패 시 개별 쓰기로 폴백하지 않는다. */
export async function saveNotice(db: SupabaseClient, input: NoticeSaveInput): Promise<number> {
  if (!input.title.trim()) throw new Error('제목을 입력하세요.')
  const ids = [...new Set(resolveNoticeTargetIds(input.targetMode, input.studentIds))]
  if (input.targetMode === 'selected' && ids.length === 0) throw new Error('대상 학생을 한 명 이상 선택하세요.')
  const { data, error } = await db.rpc('save_notice_with_targets', {
    p_notice_id: input.id, p_title: input.title, p_content: input.content,
    p_pinned: input.pinned, p_target_mode: input.targetMode, p_student_ids: ids,
  })
  if (error) {
    if (error.code === 'P0001' || error.code === '42501') throw new Error(error.message)
    throw new Error('공지를 저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.')
  }
  if (!Number.isSafeInteger(data) || data <= 0) throw new Error('공지 저장 결과를 확인하지 못했습니다. 목록을 확인해 주세요.')
  return data
}
