import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { requireAdmin } from '@/lib/admin-api-auth'
import { BACKUP_ARTIFACT, BACKUP_WORKFLOW, backupGitHub, backupGitHubConfig, backupRuns } from '@/lib/backup-github'

export const runtime = 'nodejs'
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }) }

async function authorize(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return json({ error: '서버 인증 설정을 확인해 주세요.' }, 503)
  const authorization = await requireAdmin(request, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }))
  if (authorization.response) {
    const response = authorization.response
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  }
  return null
}

async function toolkit() {
  const zip = new JSZip()
  // Keep every file path literal so Next.js traces only public toolkit files, not the project root.
  const names = ['backup.py', 'config.example.json', 'Run-Backup.ps1', 'verify.py', 'backup-recovery.md']
  const contents = await Promise.all([
    readFile(path.join(process.cwd(), 'scripts/backup/backup.py')),
    readFile(path.join(process.cwd(), 'scripts/backup/config.example.json')),
    readFile(path.join(process.cwd(), 'scripts/backup/Run-Backup.ps1')),
    readFile(path.join(process.cwd(), 'scripts/backup/verify.py')),
    readFile(path.join(process.cwd(), 'docs/backup-recovery.md')),
  ])
  contents.forEach((data, index) => zip.file(names[index], data))
  return new Response(new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' })), {
    headers: { ...headers, 'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="teachers-math-backup-toolkit.zip"' },
  })
}

async function download() {
  // Resolve artifact from this workflow's successful run, never an arbitrary supplied ID or URL.
  const runs = await backupRuns()
  for (const run of runs.filter(r => r.status === 'completed' && r.conclusion === 'success')) {
    const response = await backupGitHub(`actions/runs/${run.id}/artifacts`)
    if (!response.ok) throw new Error('Cannot read artifacts')
    const payload = await response.json()
    const artifact = payload.artifacts.find((a: { name: string; expired: boolean }) => a.name === BACKUP_ARTIFACT && !a.expired)
    if (!artifact) continue
    const redirect = await backupGitHub(`actions/artifacts/${artifact.id}/zip`)
    const location = redirect.headers.get('location')
    if (redirect.status !== 302 || !location || new URL(location).protocol !== 'https:') throw new Error('Download failed')
    // Never forward the GitHub token to the signed artifact host.
    const file = await fetch(location, { cache: 'no-store', signal: AbortSignal.timeout(45000) })
    if (!file.ok || !file.body) throw new Error('Download failed')
    return new Response(file.body, { headers: { ...headers, 'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="teachers-math-backup-${run.id}.zip"` } })
  }
  return json({ error: '다운로드할 백업이 없습니다. Google Drive 백업 완료 후 다시 확인해 주세요. GitHub 다운로드 사본은 30일간 보관됩니다.' }, 404)
}

export async function GET(request: Request) {
  const denial = await authorize(request)
  if (denial) return denial
  const action = new URL(request.url).searchParams.get('action') ?? 'status'
  try {
    if (action === 'toolkit') return await toolkit()
    if (action === 'guide') return new Response(await readFile(path.join(process.cwd(), 'docs/backup-recovery.md'), 'utf8'), {
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="backup-recovery.md"' },
    })
    if (action !== 'status' && action !== 'download') return json({ error: '지원하지 않는 요청입니다.' }, 400)
    if (!backupGitHubConfig()) {
      if (action === 'download') return json({ error: 'Google Drive 원격 백업 연결이 필요합니다.' }, 503)
      return json({ configured: false, runs: [] })
    }
    if (action === 'download') return await download()
    const runs = await backupRuns()
    const rows = await Promise.all(runs.map(async r => {
      let downloadable = false
      if (r.status === 'completed' && r.conclusion === 'success') {
        const response = await backupGitHub(`actions/runs/${r.id}/artifacts`)
        if (!response.ok) throw new Error('Cannot read artifact availability')
        const payload = await response.json()
        downloadable = payload.artifacts.some((a: { name: string; expired: boolean }) => a.name === BACKUP_ARTIFACT && !a.expired)
      }
      return { id: r.id, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, downloadable }
    }))
    return json({ configured: true, runs: rows })
  } catch {
    return json({ error: '백업 서비스 연결에 실패했습니다. 설정 가이드의 토큰 권한·워크플로 등록·실행 기록을 확인해 주세요.' }, 502)
  }
}

export async function POST(request: Request) {
  const denial = await authorize(request)
  if (denial) return denial
  let body: unknown
  try { body = await request.json() } catch { return json({ error: '요청 형식을 확인해 주세요.' }, 400) }
  if (!body || typeof body !== 'object' || !('action' in body) || body.action !== 'run-google') return json({ error: '지원하지 않는 요청입니다.' }, 400)
  try {
    const config = backupGitHubConfig()
    if (!config) return json({ error: 'Google Drive 원격 백업 연결이 필요합니다.' }, 503)
    const runs = await backupRuns()
    if (runs.some(r => r.status !== 'completed')) return json({ error: '이미 백업 작업이 대기 또는 실행 중입니다. 잠시 후 상태를 확인해 주세요.' }, 409)
    const response = await backupGitHub(`actions/workflows/${BACKUP_WORKFLOW}/dispatches`, {
      method: 'POST', body: JSON.stringify({ ref: config.ref }),
    })
    if (response.status !== 204) throw new Error('Dispatch failed')
    return json({ message: '백업 실행을 요청했습니다. 실제 완료 여부는 실행 기록에서 확인해 주세요.' }, 202)
  } catch {
    return json({ error: '실행 요청 결과를 확인하지 못했습니다. 중복 실행 전 상태를 새로고침해 주세요.' }, 502)
  }
}
