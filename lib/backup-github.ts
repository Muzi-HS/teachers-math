// Server-only caller: credentials are read at request time and never returned to the browser.
export const BACKUP_WORKFLOW = 'supabase-backup.yml'
export const BACKUP_ARTIFACT = 'teachers-math-encrypted-backup'

export type BackupRun = {
  id: number; status: string; conclusion: string | null; created_at: string; html_url: string
}

export function backupGitHubConfig() {
  const repository = process.env.BACKUP_GITHUB_REPOSITORY ?? ''
  const token = process.env.BACKUP_GITHUB_TOKEN ?? ''
  const ref = process.env.BACKUP_GITHUB_REF || 'main'
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) return null
  return { repository, token, ref }
}

export async function backupGitHub(path: string, init: RequestInit = {}) {
  const config = backupGitHubConfig()
  if (!config) throw new Error('Backup control is not configured')
  return fetch(`https://api.github.com/repos/${config.repository}/${path}`, {
    ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
  })
}

export async function backupRuns(): Promise<BackupRun[]> {
  const config = backupGitHubConfig()
  if (!config) throw new Error('Backup control is not configured')
  const response = await backupGitHub(`actions/workflows/${BACKUP_WORKFLOW}/runs?per_page=10&branch=${encodeURIComponent(config.ref)}`)
  if (!response.ok) throw new Error('Cannot read backup runs')
  const payload = await response.json()
  return payload.workflow_runs
}
