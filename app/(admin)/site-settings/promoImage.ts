import { supabase } from '@/lib/supabase'

export async function uploadPromoImage(file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('promo-images').upload(path, file)
  if (error) return { url: null, error: error.message }
  const { data } = supabase.storage.from('promo-images').getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}
