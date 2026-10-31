import { supabase } from './supabase'

export async function validateClientSession(kind: 'parent' | 'student', id: number, token: string) {
  let extend = false
  try {
    const saved = JSON.parse(localStorage.getItem(`${kind}_auto_login`) ?? 'null')
    extend = saved?.session?.sessionToken === token
  } catch { /* A missing auto-login preference never enables renewal. */ }
  const { data, error } = await supabase.rpc('client_refresh_session', { p_token: token, p_extend: extend })
  if (error) throw error
  return Array.isArray(data) && data.some(row => row.subject_type === kind && row.subject_id === id)
}

export function clearClientSession(kind: 'parent' | 'student') {
  sessionStorage.removeItem(`${kind}_session`)
  localStorage.removeItem(`${kind}_auto_login`)
}
