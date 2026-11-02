import { useStore } from '@nanostores/react'
import { memo, useEffect, useMemo, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { useStoreSelector } from '@/lib/use-session-slice'
import { $sessionDotStateById } from '@/store/session-dot-state'
import { $sessionStates } from '@/store/session-states'
import {
  $sidebarSettledOpen,
  $sidebarSnoozedOpen,
  $sidebarWorkingOpen,
  $threadTriage,
  sessionActivityMs,
  setSidebarSettledOpen,
  setSidebarSnoozedOpen,
  setSidebarWorkingOpen
} from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

import { T3ThreadCard } from './t3-thread-list'
import { useTriageCopy } from './triage-actions'
import { classifyRow } from './triage-classify'

export interface TriageSplit {
  /** Finished sessions waiting for review (shown in the main recents list). */
  main: SessionInfo[]
  /** Actively working sessions (Working tray at the bottom). */
  working: SessionInfo[]
  /** Explicitly or auto-settled sessions (Settled tray at the very bottom). */
  settled: SessionInfo[]
  /** Snoozed sessions (hidden from main and working). */
  snoozed: SessionInfo[]
}

/**
 * Split recents into Main (waiting for review) / Working / Settled / Snoozed.
 * When triage is disabled, all sessions stay in `main`.
 */
export function useTriageSplit(sessions: SessionInfo[], enabled: boolean): TriageSplit {
  const triage = useStore($threadTriage)
  const dotStates = useStore($sessionDotStateById)

  return useMemo(() => {
    if (!enabled) {
      return { main: sessions, settled: [], snoozed: [], working: [] }
    }

    const now = Date.now()
    const out: TriageSplit = { main: [], settled: [], snoozed: [], working: [] }

    for (const session of sessions) {
      const bucket = classifyRow(session, triage, dotStates, now)
      out[bucket].push(session)
    }

    // Settled sessions are sorted by most recent activity descending.
    out.settled.sort((a, b) => (sessionActivityMs(b) ?? 0) - (sessionActivityMs(a) ?? 0))

    return out
  }, [enabled, sessions, triage, dotStates])
}

/** Live timer that ticks every 15s to update "Working 3m" labels. */
function useElapsedTimer(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)

    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

/** Compact elapsed label for the Working tray ("<1m", "3m", "1h 12m"). */
export function formatWorkingElapsed(startedMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - startedMs) / 60_000))

  if (minutes < 1) {
    return '<1m'
  }

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Start of the live turn for a listed session; runtime states are keyed by runtime id, so match on stored ids. */
function turnStartFor(
  states: Record<string, { storedSessionId: null | string; turnStartedAt: null | number }>,
  session: SessionInfo
) {
  const ids = new Set([session.id, session._lineage_root_id, ...(session._lineage_ids ?? [])])
  let start: number | undefined

  for (const state of Object.values(states)) {
    if (state.storedSessionId && ids.has(state.storedSessionId) && state.turnStartedAt) {
      start = start === undefined ? state.turnStartedAt : Math.min(start, state.turnStartedAt)
    }
  }

  return start
}

interface TrayCardRowProps {
  active: boolean
  onArchiveSession?: (id: string) => void
  onDeleteSession?: (id: string) => void
  onSelect: () => void
  session: SessionInfo
}

const WorkingTrayCard = memo(function WorkingTrayCard({
  active,
  onArchiveSession,
  onDeleteSession,
  onSelect,
  session
}: TrayCardRowProps) {
  const turnStart = useStoreSelector($sessionStates, states => turnStartFor(states, session))
  const c = useTriageCopy()
  const now = useElapsedTimer()
  const startedMs = turnStart ?? sessionActivityMs(session) ?? now
  const elapsed = formatWorkingElapsed(startedMs, now)

  const status = (
    <span className="flex items-center gap-1 font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
      <GlyphSpinner className="size-3" />
      <span>{c.workingFor(elapsed)}</span>
    </span>
  )

  return (
    <T3ThreadCard
      active={active}
      onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
      onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
      onSelect={onSelect}
      session={session}
      status={status}
      variant="working"
    />
  )
})

interface TrayHeaderButtonProps {
  count: number
  label: string
  onToggle: () => void
  open: boolean
}

function TrayHeaderButton({ count, label, onToggle, open }: TrayHeaderButtonProps) {
  return (
    <button
      className="flex h-9 w-full items-center justify-between rounded-md px-2.5 text-left text-sm font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
      onClick={onToggle}
      type="button"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-(--ui-text-tertiary)">
        <span>{count}</span>
        <Codicon name={open ? 'chevron-down' : 'chevron-right'} size="0.75rem" />
      </span>
    </button>
  )
}

export interface TriageTraysProps {
  activeSessionId: null | string
  onArchiveSession?: (id: string) => void
  onDeleteSession?: (id: string) => void
  onResumeSession: (id: string, session?: SessionInfo) => void
  split: TriageSplit
}

/**
 * T3 Code-style Working, Settled, and Snoozed trays docked at the bottom of the sidebar.
 * Header rows are ~36px, text-sm, label left, count + caret right.
 * Working and Settled rows render as readable two-line cards.
 */
export function TriageTrays({
  activeSessionId,
  onArchiveSession,
  onDeleteSession,
  onResumeSession,
  split
}: TriageTraysProps) {
  const c = useTriageCopy()
  const workingOpen = useStore($sidebarWorkingOpen)
  const settledOpen = useStore($sidebarSettledOpen)
  const snoozedOpen = useStore($sidebarSnoozedOpen)

  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-(--sidebar-edge-border) px-1 py-1">
      {/* Working Tray */}
      <TrayHeaderButton
        count={split.working.length}
        label={c.working}
        onToggle={() => setSidebarWorkingOpen(!workingOpen)}
        open={workingOpen}
      />
      {workingOpen && split.working.length > 0 && (
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
          {split.working.map(session => (
            <WorkingTrayCard
              active={session.id === activeSessionId}
              key={session.id}
              onArchiveSession={onArchiveSession}
              onDeleteSession={onDeleteSession}
              onSelect={() => onResumeSession(session.id, session)}
              session={session}
            />
          ))}
        </div>
      )}

      {/* Settled Tray */}
      <TrayHeaderButton
        count={split.settled.length}
        label={c.settled}
        onToggle={() => setSidebarSettledOpen(!settledOpen)}
        open={settledOpen}
      />
      {settledOpen && split.settled.length > 0 && (
        <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
          {split.settled.map(session => (
            <T3ThreadCard
              active={session.id === activeSessionId}
              key={session.id}
              onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
              onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
              onSelect={() => onResumeSession(session.id, session)}
              session={session}
              variant="settled"
            />
          ))}
        </div>
      )}

      {/* Snoozed Tray (if any) */}
      {split.snoozed.length > 0 && (
        <>
          <TrayHeaderButton
            count={split.snoozed.length}
            label={c.snoozed}
            onToggle={() => setSidebarSnoozedOpen(!snoozedOpen)}
            open={snoozedOpen}
          />
          {snoozedOpen && (
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
              {split.snoozed.map(session => (
                <T3ThreadCard
                  active={session.id === activeSessionId}
                  key={session.id}
                  onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
                  onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                  onSelect={() => onResumeSession(session.id, session)}
                  session={session}
                  variant="snoozed"
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
