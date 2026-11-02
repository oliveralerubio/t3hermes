import { describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

import { mergeTriageSessions } from './t3-thread-model'

const row = (id: string, last_active: number, source = 'desktop') =>
  ({ id, last_active, source, started_at: last_active }) as SessionInfo

describe('mergeTriageSessions', () => {
  it('returns recents untouched when there is no messaging', () => {
    const recents = [row('a', 10)]

    expect(mergeTriageSessions(recents, [])).toBe(recents)
  })

  it('merges messaging rows, newest activity first', () => {
    const merged = mergeTriageSessions([row('a', 10), row('b', 30)], [row('t', 20, 'telegram')])

    expect(merged.map(s => s.id)).toEqual(['b', 't', 'a'])
  })

  it('dedupes by id, keeping the recents copy', () => {
    const recents = [row('a', 10)]

    const merged = mergeTriageSessions(recents, [
      row('a', 99, 'telegram'),
      row('t', 5, 'telegram'),
      row('t', 6, 'telegram')
    ])

    expect(merged.map(s => s.id)).toEqual(['a', 't'])
    expect(merged[0]).toBe(recents[0])
  })
})
