/** Retire credentials from the removed streaming integration without touching local music. */
export function clearLegacyStreamingCredentials(storage: Pick<Storage, 'removeItem'>) {
  for (const key of ['discdeck.spotify.token', 'discdeck.spotify.verifier', 'discdeck.spotify.state']) {
    try { storage.removeItem(key); } catch { /* Storage may be blocked in private browsing. */ }
  }
}
