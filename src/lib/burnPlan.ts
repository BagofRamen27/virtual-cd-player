export const CD_GAP = 2;
export function discSeconds(durations: number[]): number {
  return durations.reduce((sum, duration) => sum + duration, 0) + Math.max(0, durations.length - 1) * CD_GAP;
}
export function validateDisc(title: string, durations: number[], minutes: number): string | null {
  if (!title.trim()) return 'Give your disc a name.';
  if (!durations.length) return 'Add at least one audio track.';
  if (durations.length > 99) return 'A CD can hold up to 99 tracks.';
  if (durations.some(d => !Number.isFinite(d) || d <= 0)) return 'Remove tracks whose duration could not be read.';
  if (discSeconds(durations) > minutes * 60) return `This mix exceeds the ${minutes}-minute disc. Remove a track or choose a larger disc.`;
  return null;
}
export function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || 'Disc';
}
