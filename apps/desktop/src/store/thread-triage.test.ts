import { afterEach, describe, expect, it } from 'vitest'

import { createClientSessionState } from '@/lib/chat-runtime'
import { rescopeConnectionScopedStores } from '@/lib/connection-scoped'
import { readKey } from '@/lib/storage'
import type { SessionInfo } from '@/types/hermes'

import { $sessions } from './session'
import { clearAllSessionStates, publishSessionState } from './session-states'
import {
  $sidebarSettledOpen,
  $sidebarSnoozedOpen,
  $threadTriage,
  AUTO_SETTLE_AFTER_MS,
  classify,
  setSidebarSettledOpen,
  setSidebarSnoozedOpen,
  settleSession,
  snoozeOneHourMs,
  snoozeSession,
  snoozeUntilTomorrowMs,
  THREAD_TRIAGE_STORAGE_KEY,
  unsettleSession,
  unsnoozeSession
} from './thread-triage'

const NOW = 1_700_000_000_000
const HOUR = 3_600_000

/** A session last active `agoMs` before NOW (last_active is epoch seconds). */
function makeSession(id: string, agoMs = HOUR, overrides: Partial<SessionInfo> = {}): SessionInfo {
  const at = Math.floor((NOW - agoMs) / 1000)

  return { id, last_active: at, started_at: at, ...overrides } as SessionInfo
}

describe('thread-triage store and classify', () => {
  afterEach(() => {
    clearAllSessionStates()
    $sessions.set([])
    rescopeConnectionScopedStores({ mode: 'local', profile: 'default' })
    $threadTriage.set({})
    $sidebarSettledOpen.set(false)
    $sidebarSnoozedOpen.set(false)
    localStorage.clear()
  })

  describe('classify', () => {
    const now = NOW
    const old = AUTO_SETTLE_AFTER_MS + HOUR

    it('puts a running session in the working tray, never the main list', () => {
      expect(classify(makeSession('s1'), {}, ['s1'], now)).toBe('working')
      expect(classify(makeSession('s1'), {}, new Set(['s1']), now)).toBe('working')
      expect(classify(makeSession('s1', old), {}, ['s1'], now)).toBe('working')
    })

    it('keeps a recently finished session in the main list', () => {
      expect(classify(makeSession('s1'), {}, [], now)).toBe('main')
    })

    it('auto-settles a finished session idle for more than 24h', () => {
      expect(classify(makeSession('s1', old), {}, [], now)).toBe('settled')
      expect(classify(makeSession('s1', AUTO_SETTLE_AFTER_MS - HOUR), {}, [], now)).toBe('main')
    })

    it('never auto-settles an unread or needs-input session', () => {
      expect(classify(makeSession('s1', old), {}, [], now, { needsAttention: true })).toBe('main')
    })

    it('settles immediately on an explicit settle, even when recent', () => {
      const triage = { s1: { settledAt: now - 5_000 } }

      expect(classify(makeSession('s1'), triage, [], now)).toBe('settled')
      expect(classify(makeSession('s1'), triage, [], now, { needsAttention: true })).toBe('settled')
    })

    it('returns a settled session to main when new activity lands after settledAt', () => {
      const triage = { s1: { settledAt: now - 2 * HOUR } }

      expect(classify(makeSession('s1', HOUR), triage, [], now)).toBe('main')
    })

    it('keeps a moved-back old session in main until 24h of new idleness', () => {
      const triage = { s1: { unsettledAt: now - HOUR } }

      expect(classify(makeSession('s1', old), triage, [], now)).toBe('main')
      expect(classify(makeSession('s1', old), triage, [], now + AUTO_SETTLE_AFTER_MS)).toBe('settled')
    })

    it('classifies a session with snoozedUntil > now as snoozed (highest precedence)', () => {
      const triage = { s1: { settledAt: now - 5_000, snoozedUntil: now + 60_000 } }

      expect(classify(makeSession('s1'), triage, [], now)).toBe('snoozed')
      expect(classify(makeSession('s1'), triage, ['s1'], now)).toBe('snoozed')
    })

    it('falls back to settled or main once snoozedUntil <= now', () => {
      const expiredSettled = { s1: { settledAt: now - 5_000, snoozedUntil: now } }
      const expiredUnsettled = { s1: { snoozedUntil: now - 1 } }

      expect(classify(makeSession('s1'), expiredSettled, [], now)).toBe('settled')
      expect(classify(makeSession('s1'), expiredUnsettled, [], now)).toBe('main')
    })

    it('does not auto-settle an id-only lookup (no activity known)', () => {
      expect(classify('s1', {}, [], now)).toBe('main')
      expect(classify('s1', { s1: { settledAt: now } }, [], now)).toBe('settled')
    })

    it('matches lineage root and lineage aliases on compressed sessions', () => {
      const compressed = makeSession('tip-2', old, {
        _lineage_ids: ['root-1', 'mid-1', 'tip-2'],
        _lineage_root_id: 'root-1'
      })

      expect(classify(compressed, { 'root-1': { unsettledAt: now - 100 } }, [], now)).toBe('main')
      expect(classify(compressed, {}, ['tip-2'], now)).toBe('working')
      expect(classify(compressed, { 'mid-1': { snoozedUntil: now + 10_000 } }, [], now)).toBe('snoozed')
    })
  })

  describe('helpers and persistence', () => {
    it('settles and unsettles a session and persists to connection-scoped storage', () => {
      settleSession('s1', 123_456)
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 123_456 } })
      expect(JSON.parse(readKey(THREAD_TRIAGE_STORAGE_KEY) ?? '{}')).toEqual({ s1: { settledAt: 123_456 } })

      unsettleSession('s1', 789)
      expect($threadTriage.get()).toEqual({ s1: { unsettledAt: 789 } })
    })

    it('snoozes and unsnoozes a session while preserving settled state if present', () => {
      settleSession('s1', 100)
      snoozeSession('s1', 500)
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 100, snoozedUntil: 500 } })

      unsnoozeSession('s1')
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 100 } })
    })

    it('clears settled automatically when a session enters $workingSessionIds', () => {
      settleSession('s1', 1_000)
      settleSession('s2', 1_000)
      expect(classify('s1')).toBe('settled')

      publishSessionState('rt-1', { ...createClientSessionState('s1'), busy: true })

      expect(classify('s1')).toBe('working')
      expect($threadTriage.get().s1).toBeUndefined()
      expect($threadTriage.get().s2).toEqual({ settledAt: 1_000 })

      // After the turn finishes it lands in the main list for review.
      publishSessionState('rt-1', { ...createClientSessionState('s1'), busy: false })
      expect(classify('s1')).toBe('main')
    })

    it('computes snooze helper timestamps in the future', () => {
      const now = new Date(2026, 10, 2, 14, 30, 0, 0).getTime()
      expect(snoozeOneHourMs(now)).toBe(now + 3_600_000)

      const tomorrow = snoozeUntilTomorrowMs(now)
      const tomorrowDate = new Date(tomorrow)
      expect(tomorrow).toBeGreaterThan(now)
      expect(tomorrowDate.getHours()).toBe(9)
      expect(tomorrowDate.getMinutes()).toBe(0)
    })

    it('isolates triage state across remote connections', () => {
      settleSession('local-1', 111)
      rescopeConnectionScopedStores({ baseUrl: 'https://remote.example', mode: 'remote', profile: 'default' })
      expect($threadTriage.get()).toEqual({})

      settleSession('remote-1', 222)
      expect($threadTriage.get()).toEqual({ 'remote-1': { settledAt: 222 } })

      rescopeConnectionScopedStores({ mode: 'local', profile: 'default' })
      expect($threadTriage.get()).toEqual({ 'local-1': { settledAt: 111 } })
    })

    it('persists collapsed section toggles', () => {
      expect($sidebarSettledOpen.get()).toBe(false)
      expect($sidebarSnoozedOpen.get()).toBe(false)

      setSidebarSettledOpen(true)
      setSidebarSnoozedOpen(true)

      expect($sidebarSettledOpen.get()).toBe(true)
      expect($sidebarSnoozedOpen.get()).toBe(true)
    })
  })
})
