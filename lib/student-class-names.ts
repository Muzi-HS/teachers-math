import { supabase } from '@/lib/supabase'

// Fetch all visible memberships so students taking several classes keep every class name.
export async function loadStudentClassNames(): Promise<Record<number, string>> {
  const [classes, memberships] = await Promise.all([
    (async () => {
      const rows: { id: number; name: string }[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('classes').select('id,name').order('id').range(offset, offset + 999)
        if (error) throw error
        rows.push(...(data ?? []))
        if ((data?.length ?? 0) < 1000) return rows
      }
    })(),
    (async () => {
      const rows: { class_id: number; student_id: number }[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('class_students').select('class_id,student_id')
          .order('class_id').order('student_id').range(offset, offset + 999)
        if (error) throw error
        rows.push(...(data ?? []))
        if ((data?.length ?? 0) < 1000) return rows
      }
    })(),
  ])
  const names = new Map(classes.map(row => [row.id, row.name]))
  const grouped = new Map<number, Set<string>>()
  for (const row of memberships) {
    const name = names.get(row.class_id)
    if (!name) continue
    const group = grouped.get(row.student_id) ?? new Set<string>()
    group.add(name)
    grouped.set(row.student_id, group)
  }
  return Object.fromEntries([...grouped].map(([id, group]) => [id, [...group].sort((a, b) => a.localeCompare(b, 'ko')).join(', ')]))
}
