import { supabase } from '@/lib/supabase'

export type ClassBulkSendStatus = {
  date: string
  class_id: number | null
  record_count: number
  clicked_at: string | null
}

export async function loadPendingClassSends(): Promise<ClassBulkSendStatus[]> {
  const rows: ClassBulkSendStatus[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('class_bulk_send_status')
      .select('date,class_id,record_count,clicked_at').is('clicked_at', null)
      .order('date', { ascending: false }).order('class_id', { nullsFirst: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}
