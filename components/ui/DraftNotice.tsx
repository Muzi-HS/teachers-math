export default function DraftNotice({ available, status, onRestore, onDiscard }: {
  available: boolean; status: string; onRestore: () => void; onDiscard: () => void
}) {
  if (!available && !status) return null
  return <div role="status" style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: 'var(--ui-info-bg)', color: 'var(--ui-info)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
    <span style={{ flex: '1 1 180px' }}>{available ? '이 탭에 이전 작성 내용이 남아 있습니다. 불러오기 전에 현재 저장 내용을 확인하세요.' : status}</span>
    {available && <>
      <button type="button" onClick={onRestore} style={{ font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 6 }}>불러오기</button>
      <button type="button" onClick={onDiscard} style={{ font: 'inherit', cursor: 'pointer', padding: 6 }}>임시본 삭제</button>
    </>}
  </div>
}
