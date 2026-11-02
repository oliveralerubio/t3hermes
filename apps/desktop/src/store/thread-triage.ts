import { connectionScopedAtom } from '@/lib/connection-scoped'
import { Codecs, persistentAtom } from '@/lib/persisted'
import type { SessionInfo } from '@/types/hermes'

import { $workingSessionIds } from './session-states'

export const THREAD_TRIAGE_STORAGE_KEY = 'hermes.desktop.threadTriage'
export const SIDEBAR_SETTLED_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarSettledOpen'
export const SIDEBAR_SNOOZED_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarSnoozedOpen'

export interface ThreadTriageRecord {
  settledAt?: number
  snoozedUntil?: number
}

export type ThreadTriageMap = Record<string, ThreadTriageRecord>
export type ThreadTriageBucket = 'settled' | 'snoozed' | 'working'

export type TriageSessionIdLike =
  | Pick<SessionInfo, '_lineage_ids' | '_lineage_root_id' | 'id'>
  | string

function sanitizeTriageRecord(raw: unknown): ThreadTriageRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const record = raw as Record<string, unknown>

  const settledAt =
    typeof record.settledAt === 'number' && Number.isFinite(record.settledAt) && record.settledAt > 0
      ? record.settledAt
      : undefined

  const snoozedUntil =
    typeof record.snoozedUntil === 'number' && Number.isFinite(record.snoozedUntil) && record.snoozedUntil > 0
      ? record.snoozedUntil
      : undefined

  if (settledAt === undefined && snoozedUntil === undefined) {
    return null
  }

  const out: ThreadTriageRecord = {}

  if (settledAt !== undefined) {
    out.settledAt = settledAt
  }

  if (snoozedUntil !== undefined) {
    out.snoozedUntil = snoozedUntil
  }

  return out
}

function sanitizeTriageMap(raw: unknown): ThreadTriageMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const out: ThreadTriageMap = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!key) {
      continue
    }

    const clean = sanitizeTriageRecord(value)

    if (clean) {
      out[key] = clean
    }
  }

  return out
}

export const $threadTriage = connectionScopedAtom<ThreadTriageMap>(
  THREAD_TRIAGE_STORAGE_KEY,
  {},
  Codecs.json<ThreadTriageMap>(sanitizeTriageMap),
  { includeProfile: false }
)

export const $sidebarSettledOpen = persistentAtom(SIDEBAR_SETTLED_OPEN_STORAGE_KEY, false, Codecs.bool)
export const $sidebarSnoozedOpen = persistentAtom(SIDEBAR_SNOOZED_OPEN_STORAGE_KEY, false, Codecs.bool)

export function setSidebarSettledOpen(open: boolean): void {
  $sidebarSettledOpen.set(open)
}

export function setSidebarSnoozedOpen(open: boolean): void {
  $sidebarSnoozedOpen.set(open)
}

function sessionCandidateIds(session: TriageSessionIdLike): string[] {
  if (typeof session === 'string') {
    const trimmed = session.trim()

    return trimmed ? [trimmed] : []
  }

  const ids: string[] = []

  const add = (id: null | string | undefined) => {
    const trimmed = id?.trim()

    if (trimmed && !ids.includes(trimmed)) {
      ids.push(trimmed)
    }
  }

  add(session._lineage_root_id)
  add(session.id)

  if (session._lineage_ids) {
    for (const id of session._lineage_ids) {
      add(id)
    }
  }

  return ids
}

function hasWorkingMatch(ids: readonly string[], workingIds: Iterable<string>): boolean {
  if (ids.length === 0) {
    return false
  }

  if (workingIds instanceof Set) {
    return ids.some(id => workingIds.has(id))
  }

  if (Array.isArray(workingIds)) {
    return ids.some(id => workingIds.includes(id))
  }

  const set = new Set(workingIds)

  return ids.some(id => set.has(id))
}

function lookupTriageRecord(ids: readonly string[], triage: ThreadTriageMap): ThreadTriageRecord | undefined {
  let settledAt: number | undefined
  let snoozedUntil: number | undefined

  for (const id of ids) {
    const entry = triage[id]

    if (!entry) {
      continue
    }

    if (entry.settledAt !== undefined && (settledAt === undefined || entry.settledAt > settledAt)) {
      settledAt = entry.settledAt
    }

    if (entry.snoozedUntil !== undefined && (snoozedUntil === undefined || entry.snoozedUntil > snoozedUntil)) {
      snoozedUntil = entry.snoozedUntil
    }
  }

  if (settledAt === undefined && snoozedUntil === undefined) {
    return undefined
  }

  return { settledAt, snoozedUntil }
}

/**
 * Pure triage classifier for a sidebar session.
 *
 * Precedence:
 * 1. snoozedUntil > now => 'snoozed'
 * 2. session id in workingIds => 'working' (a running turn always shows as working)
 * 3. explicitly settled (settledAt > 0) => 'settled'
 * 4. otherwise => 'working'
 */
export function classify(
  session: TriageSessionIdLike,
  triage: ThreadTriageMap = $threadTriage.get(),
  workingIds: Iterable<string> = $workingSessionIds.get(),
  now: number = Date.now()
): ThreadTriageBucket {
  const ids = sessionCandidateIds(session)
  const record = lookupTriageRecord(ids, triage)

  if (record?.snoozedUntil !== undefined && record.snoozedUntil > now) {
    return 'snoozed'
  }

  if (hasWorkingMatch(ids, workingIds)) {
    return 'working'
  }

  if (record?.settledAt !== undefined && record.settledAt > 0) {
    return 'settled'
  }

  return 'working'
}

export function settleSession(id: string, atMs: number = Date.now()): void {
  const key = id.trim()

  if (!key) {
    return
  }

  const current = $threadTriage.get()
  const existing = current[key]

  $threadTriage.set({
    ...current,
    [key]: {
      ...(existing?.snoozedUntil !== undefined ? { snoozedUntil: existing.snoozedUntil } : {}),
      settledAt: atMs
    }
  })
}

export function unsettleSession(id: string): void {
  const key = id.trim()

  if (!key) {
    return
  }

  const current = $threadTriage.get()
  const existing = current[key]

  if (!existing || existing.settledAt === undefined) {
    return
  }

  const next = { ...current }

  if (existing.snoozedUntil !== undefined) {
    next[key] = { snoozedUntil: existing.snoozedUntil }
  } else {
    delete next[key]
  }

  $threadTriage.set(next)
}

export function snoozeSession(id: string, untilMs: number): void {
  const key = id.trim()

  if (!key || !Number.isFinite(untilMs) || untilMs <= 0) {
    return
  }

  const current = $threadTriage.get()
  const existing = current[key]

  $threadTriage.set({
    ...current,
    [key]: {
      ...(existing?.settledAt !== undefined ? { settledAt: existing.settledAt } : {}),
      snoozedUntil: untilMs
    }
  })
}

export function unsnoozeSession(id: string): void {
  const key = id.trim()

  if (!key) {
    return
  }

  const current = $threadTriage.get()
  const existing = current[key]

  if (!existing || existing.snoozedUntil === undefined) {
    return
  }

  const next = { ...current }

  if (existing.settledAt !== undefined) {
    next[key] = { settledAt: existing.settledAt }
  } else {
    delete next[key]
  }

  $threadTriage.set(next)
}

export function snoozeOneHourMs(now: number = Date.now()): number {
  return now + 60 * 60 * 1000
}

export function snoozeUntilTomorrowMs(now: number = Date.now()): number {
  const target = new Date(now)
  target.setDate(target.getDate() + 1)
  target.setHours(9, 0, 0, 0)

  return target.getTime()
}

function clearSettledForWorkingIds(workingIds: readonly string[]): void {
  if (!workingIds.length) {
    return
  }

  const current = $threadTriage.get()
  let next: ThreadTriageMap | null = null

  for (const id of workingIds) {
    const existing = current[id]

    if (!existing || existing.settledAt === undefined) {
      continue
    }

    next ??= { ...current }

    if (existing.snoozedUntil !== undefined) {
      next[id] = { snoozedUntil: existing.snoozedUntil }
    } else {
      delete next[id]
    }
  }

  if (next) {
    $threadTriage.set(next)
  }
}

// A running turn always shows as working and clears settled.
$workingSessionIds.subscribe(clearSettledForWorkingIds)
