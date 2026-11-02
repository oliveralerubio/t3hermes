import { useStore } from '@nanostores/react'
import { memo, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { Tip } from '@/components/ui/tooltip'
import { sessionTitle } from '@/lib/chat-runtime'
import { triggerHaptic } from '@/lib/haptics'
import { useStoreSelector } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
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
  setSidebarWorkingOpen,
  unsettleSession,
  unsnoozeSession
} from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

import { SessionActionsMenu } from './session-actions-menu'
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

interface TrayRowProps {
  active: boolean
  onArchiveSession?: (id: string) => void
  onDeleteSession?: (id: string) => void
  onSelect: () => void
  session: SessionInfo
}

const WorkingTrayRow = memo(function WorkingTrayRow({
  active,
  onArchiveSession,
  onDeleteSession,
  onSelect,
  session
}: TrayRowProps) {
  const turnStart = useStoreSelector($sessionStates, states => turnStartFor(states, session))
  const c = useTriageCopy()
  const now = useElapsedTimer()
  // Turn start when the runtime knows it; else the row's last activity.
  const startedMs = turnStart ?? sessionActivityMs(session) ?? now

  const elapsed = formatWorkingElapsed(startedMs, now)
  const title = sessionTitle(session)

  return (
    <div
      aria-selected={active}
      className={cn(
        'group relative flex h-7 items-center justify-between gap-1.5 rounded-md px-2 text-left text-xs transition-colors select-none',
        'hover:bg-(--ui-control-hover-background) hover:text-foreground cursor-pointer',
        active ? 'bg-(--ui-control-active-background) text-foreground font-medium' : 'text-(--ui-text-secondary)'
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <span className="truncate">{title}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="flex items-center gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          <GlyphSpinner className="size-3" />
          <span>{c.workingFor(elapsed)}</span>
        </span>
        <SessionActionsMenu
          archived={Boolean(session.archived)}
          onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
          onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
          sessionId={session.id}
          title={title}
        >
          <Button
            aria-label="Actions"
            className="size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity [&_svg]:size-3.5!"
            size="icon"
            variant="ghost"
          >
            <Codicon name="ellipsis" size="0.875rem" />
          </Button>
        </SessionActionsMenu>
      </div>
    </div>
  )
})

const SettledTrayRow = memo(function SettledTrayRow({
  active,
  onArchiveSession,
  onDeleteSession,
  onSelect,
  session
}: TrayRowProps) {
  const c = useTriageCopy()
  const title = sessionTitle(session)

  return (
    <div
      aria-selected={active}
      className={cn(
        'group relative flex h-7 items-center justify-between gap-1.5 rounded-md px-2 text-left text-xs transition-colors select-none',
        'hover:bg-(--ui-control-hover-background) hover:text-foreground cursor-pointer',
        active ? 'bg-(--ui-control-active-background) text-foreground font-medium' : 'text-(--ui-text-tertiary)'
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <span className="truncate">{title}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tip label={c.moveBack}>
          <Button
            aria-label={c.moveBack}
            className="size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity [&_svg]:size-3.5!"
            onClick={e => {
              e.stopPropagation()
              triggerHaptic('selection')
              unsettleSession(session.id)
            }}
            size="icon"
            variant="ghost"
          >
            <Codicon name="debug-restart" size="0.875rem" />
          </Button>
        </Tip>
        <SessionActionsMenu
          archived={Boolean(session.archived)}
          onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
          onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
          sessionId={session.id}
          title={title}
        >
          <Button
            aria-label="Actions"
            className="size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity [&_svg]:size-3.5!"
            size="icon"
            variant="ghost"
          >
            <Codicon name="ellipsis" size="0.875rem" />
          </Button>
        </SessionActionsMenu>
      </div>
    </div>
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
      className="flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-xs font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
      onClick={onToggle}
      type="button"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
        <span>{count}</span>
        <DisclosureCaret open={open} size="0.6875rem" />
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
 * T3 Code-style Working and Settled trays docked at the bottom of the sidebar.
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
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-(--sidebar-edge-border) pt-1 pb-1">
      {/* Working Tray */}
      <TrayHeaderButton
        count={split.working.length}
        label={c.working}
        onToggle={() => setSidebarWorkingOpen(!workingOpen)}
        open={workingOpen}
      />
      {workingOpen && split.working.length > 0 && (
        <div className="flex max-h-48 flex-col gap-px overflow-y-auto pl-1 pr-0.5">
          {split.working.map(session => (
            <WorkingTrayRow
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
        <div className="flex max-h-56 flex-col gap-px overflow-y-auto pl-1 pr-0.5">
          {split.settled.map(session => (
            <SettledTrayRow
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
            <div className="flex max-h-40 flex-col gap-px overflow-y-auto pl-1 pr-0.5">
              {split.snoozed.map(session => (
                <div
                  aria-selected={session.id === activeSessionId}
                  className="group relative flex h-7 items-center justify-between gap-1.5 rounded-md px-2 text-left text-xs text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground cursor-pointer"
                  key={session.id}
                  onClick={() => onResumeSession(session.id, session)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="truncate">{sessionTitle(session)}</span>
                  <Tip label={c.unsnooze}>
                    <Button
                      aria-label={c.unsnooze}
                      className="size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity [&_svg]:size-3.5!"
                      onClick={e => {
                        e.stopPropagation()
                        triggerHaptic('selection')
                        unsnoozeSession(session.id)
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <Codicon name="bell" size="0.875rem" />
                    </Button>
                  </Tip>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
