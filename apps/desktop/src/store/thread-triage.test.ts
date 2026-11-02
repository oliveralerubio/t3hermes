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

function makeSession(id: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    last_active: 1000,
    started_at: 1000,
    ...overrides
  } as SessionInfo
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
    const now = 1_700_000_000_000

    it('defaults an untouched session to working', () => {
      expect(classify(makeSession('s1'), {}, [], now)).toBe('working')
    })

    it('classifies an explicitly settled session as settled when not working or snoozed', () => {
      const triage = { s1: { settledAt: now - 5_000 } }

      expect(classify(makeSession('s1'), triage, [], now)).toBe('settled')
    })

    it('classifies a session in workingIds as working even if settled is present in triage map', () => {
      const triage = { s1: { settledAt: now - 5_000 } }

      expect(classify(makeSession('s1'), triage, ['s1'], now)).toBe('working')
      expect(classify(makeSession('s1'), triage, new Set(['s1']), now)).toBe('working')
    })

    it('classifies a session with snoozedUntil > now as snoozed (highest precedence)', () => {
      const triage = { s1: { settledAt: now - 5_000, snoozedUntil: now + 60_000 } }

      expect(classify(makeSession('s1'), triage, [], now)).toBe('snoozed')
      expect(classify(makeSession('s1'), triage, ['s1'], now)).toBe('snoozed')
    })

    it('falls back to settled or working once snoozedUntil <= now', () => {
      const expiredSettled = { s1: { settledAt: now - 5_000, snoozedUntil: now } }
      const expiredUnsettled = { s1: { snoozedUntil: now - 1 } }

      expect(classify(makeSession('s1'), expiredSettled, [], now)).toBe('settled')
      expect(classify(makeSession('s1'), expiredUnsettled, [], now)).toBe('working')
    })

    it('matches lineage root and lineage aliases on compressed sessions', () => {
      const compressed = makeSession('tip-2', {
        _lineage_ids: ['root-1', 'mid-1', 'tip-2'],
        _lineage_root_id: 'root-1'
      })

      expect(classify(compressed, { 'root-1': { settledAt: now - 100 } }, [], now)).toBe('settled')
      expect(classify(compressed, { 'root-1': { settledAt: now - 100 } }, ['tip-2'], now)).toBe('working')
      expect(classify(compressed, { 'mid-1': { snoozedUntil: now + 10_000 } }, [], now)).toBe('snoozed')
    })
  })

  describe('helpers and persistence', () => {
    it('settles and unsettles a session and persists to connection-scoped storage', () => {
      settleSession('s1', 123_456)
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 123_456 } })
      expect(JSON.parse(readKey(THREAD_TRIAGE_STORAGE_KEY) ?? '{}')).toEqual({ s1: { settledAt: 123_456 } })

      unsettleSession('s1')
      expect($threadTriage.get()).toEqual({})
    })

    it('snoozes and unsnoozes a session while preserving settled state if present', () => {
      settleSession('s1', 100)
      snoozeSession('s1', 500)
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 100, snoozedUntil: 500 } })

      unsnoozeSession('s1')
      expect($threadTriage.get()).toEqual({ s1: { settledAt: 100 } })

      unsettleSession('s1')
      expect($threadTriage.get()).toEqual({})
    })

    it('clears settled automatically when a session enters $workingSessionIds', () => {
      settleSession('s1', 1_000)
      settleSession('s2', 1_000)
      expect(classify('s1')).toBe('settled')

      publishSessionState('rt-1', { ...createClientSessionState('s1'), busy: true })

      expect(classify('s1')).toBe('working')
      expect($threadTriage.get().s1).toBeUndefined()
      expect($threadTriage.get().s2).toEqual({ settledAt: 1_000 })

      // Even after the turn finishes, s1 stays in Working until settled again.
      publishSessionState('rt-1', { ...createClientSessionState('s1'), busy: false })
      expect(classify('s1')).toBe('working')
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
