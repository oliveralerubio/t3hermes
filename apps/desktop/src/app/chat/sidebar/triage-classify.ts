import type { SessionDotState } from '@/store/session-dot-state'
import { classify, type ThreadTriageBucket, type ThreadTriageMap } from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

/**
 * "Running" = a turn is live or its work continues in the background
 * (working / stalled / background — the states that paint the row's arc).
 *
 * `needs-input` is deliberately NOT running here: the agent is blocked on the
 * user, so the thread belongs in the main list where the user will see it, and
 * (like `unread`) it never auto-settles.
 */
const RUNNING = new Set<SessionDotState>(['background', 'stalled', 'working'])
const NEEDS_ATTENTION = new Set<SessionDotState>(['needs-input', 'unread'])

export type DotStates = Readonly<Record<string, SessionDotState>>

/** Triage bucket for one listed row, reading the dot state the rest of the sidebar paints. */
export function classifyRow(
  session: SessionInfo,
  triage: ThreadTriageMap,
  dotStates: DotStates,
  now: number
): ThreadTriageBucket {
  const dot = dotStates[session.id]

  return classify(session, triage, dot && RUNNING.has(dot) ? [session.id] : [], now, {
    needsAttention: Boolean(dot && NEEDS_ATTENTION.has(dot))
  })
}
