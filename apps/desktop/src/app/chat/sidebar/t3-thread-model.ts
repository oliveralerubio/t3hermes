import { sessionActivityMs } from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

function activityTime(s: SessionInfo): number {
  return sessionActivityMs(s) ?? (s.last_active || s.started_at || 0)
}

/**
 * Feed messaging-platform sessions into the same triage pipeline as recents:
 * one list, deduped by id (recents win — they are the fresher copy), newest
 * activity first. Pure so the split stays testable without the sidebar.
 */
export function mergeTriageSessions(recents: SessionInfo[], messaging: SessionInfo[]): SessionInfo[] {
  if (!messaging.length) {
    return recents
  }

  const seen = new Set(recents.map(s => s.id))
  const extra = messaging.filter(s => !seen.has(s.id) && seen.add(s.id))

  if (!extra.length) {
    return recents
  }

  return [...recents, ...extra].sort((a, b) => activityTime(b) - activityTime(a))
}
