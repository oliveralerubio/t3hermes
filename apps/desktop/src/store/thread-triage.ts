import { connectionScopedAtom } from '@/lib/connection-scoped'
import { Codecs, persistentAtom } from '@/lib/persisted'
import type { SessionInfo } from '@/types/hermes'

import { $workingSessionIds } from './session-states'

export const THREAD_TRIAGE_STORAGE_KEY = 'hermes.desktop.threadTriage'
export const SIDEBAR_WORKING_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarWorkingOpen'
export const SIDEBAR_SETTLED_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarSettledOpen'
export const SIDEBAR_SNOOZED_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarSnoozedOpen'

/** Idle (finished, not unread, not waiting on the user) this long => treated as settled. */
export const AUTO_SETTLE_AFTER_MS = 24 * 60 * 60 * 1000

export interface ThreadTriageRecord {
  settledAt?: number
  snoozedUntil?: number
  /** "Move back" stamp: restarts the 24h auto-settle clock for an old session. */
  unsettledAt?: number
}

export type ThreadTriageMap = Record<string, ThreadTriageRecord>
/**
 * main    = finished, waiting for the user to review (top list)
 * working = a turn is running (Working tray)
 * settled = explicitly or automatically put away (Settled tray)
 * snoozed = hidden until `snoozedUntil`
 */
export type ThreadTriageBucket = 'main' | 'settled' | 'snoozed' | 'working'

/** Per-session facts classify() needs beyond the triage map; all optional. */
export interface TriageSignals {
  /** Last activity, ms epoch. Unknown (id-only callers) => never auto-settles. */
  lastActivityMs?: number
  /** Unread, or blocked on a user prompt: never auto-settles. */
  needsAttention?: boolean
}

export type TriageSessionIdLike = Pick<SessionInfo, '_lineage_ids' | '_lineage_root_id' | 'id'> | string

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

  const unsettledAt =
    typeof record.unsettledAt === 'number' && Number.isFinite(record.unsettledAt) && record.unsettledAt > 0
      ? record.unsettledAt
      : undefined

  if (settledAt === undefined && snoozedUntil === undefined && unsettledAt === undefined) {
    return null
  }

  const out: ThreadTriageRecord = {}

  if (unsettledAt !== undefined) {
    out.unsettledAt = unsettledAt
  }

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

export const $sidebarWorkingOpen = persistentAtom(SIDEBAR_WORKING_OPEN_STORAGE_KEY, true, Codecs.bool)
export const $sidebarSettledOpen = persistentAtom(SIDEBAR_SETTLED_OPEN_STORAGE_KEY, false, Codecs.bool)
export const $sidebarSnoozedOpen = persistentAtom(SIDEBAR_SNOOZED_OPEN_STORAGE_KEY, false, Codecs.bool)

export function setSidebarWorkingOpen(open: boolean): void {
  $sidebarWorkingOpen.set(open)
}

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
  const out: ThreadTriageRecord = {}

  for (const id of ids) {
    const entry = triage[id]

    if (!entry) {
      continue
    }

    for (const key of ['settledAt', 'snoozedUntil', 'unsettledAt'] as const) {
      const value = entry[key]

      if (value !== undefined && (out[key] === undefined || value > out[key]!)) {
        out[key] = value
      }
    }
  }

  return Object.keys(out).length ? out : undefined
}

/** Last activity (ms) of a listed session; id-only callers get undefined. */
export function sessionActivityMs(session: TriageSessionIdLike): number | undefined {
  if (typeof session === 'string') {
    return undefined
  }

  const row = session as Partial<SessionInfo>
  const raw = row.last_active || row.started_at

  if (!raw || !Number.isFinite(raw)) {
    return undefined
  }

  // Raw values > 1e11 are already in ms; values between 1e9 and 1e11 are epoch seconds.
  // Values below 1e9 (pre-2001) are uninitialized or test mocks without real clocks;
  // treating them as 1970 would auto-settle every mock session in unrelated tests.
  if (raw > 1e11) {
    return raw
  }

  return raw >= 1e9 ? raw * 1000 : undefined
}

/**
 * Pure triage classifier for a sidebar session.
 *
 * Precedence:
 * 1. snoozedUntil > now => 'snoozed'
 * 2. session id in workingIds => 'working' (a running turn)
 * 3. explicit settle with no activity since => 'settled' (wins immediately)
 * 4. unread / needs-input => 'main' (never auto-settles)
 * 5. idle longer than AUTO_SETTLE_AFTER_MS (measured from the later of last
 *    activity and a "Move back" stamp) => 'settled'
 * 6. otherwise => 'main'
 */
export function classify(
  session: TriageSessionIdLike,
  triage: ThreadTriageMap = $threadTriage.get(),
  workingIds: Iterable<string> = $workingSessionIds.get(),
  now: number = Date.now(),
  signals: TriageSignals = {}
): ThreadTriageBucket {
  const ids = sessionCandidateIds(session)
  const record = lookupTriageRecord(ids, triage)

  if (record?.snoozedUntil !== undefined && record.snoozedUntil > now) {
    return 'snoozed'
  }

  if (hasWorkingMatch(ids, workingIds)) {
    return 'working'
  }

  const lastActivityMs = signals.lastActivityMs ?? sessionActivityMs(session)

  if (record?.settledAt !== undefined && record.settledAt > 0 && (lastActivityMs ?? 0) <= record.settledAt) {
    return 'settled'
  }

  if (signals.needsAttention || lastActivityMs === undefined) {
    return 'main'
  }

  const idleSince = Math.max(lastActivityMs, record?.unsettledAt ?? 0)

  return now - idleSince > AUTO_SETTLE_AFTER_MS ? 'settled' : 'main'
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

/** "Move back": explicit settle is dropped and the 24h auto-settle clock restarts now. */
export function unsettleSession(id: string, atMs: number = Date.now()): void {
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
      unsettledAt: atMs
    }
  })
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
      ...existing,
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

  const { snoozedUntil: _drop, ...rest } = existing

  if (Object.keys(rest).length) {
    next[key] = rest
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

    const { settledAt: _drop, ...rest } = existing

    if (Object.keys(rest).length) {
      next[id] = rest
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
