import { useStore } from '@nanostores/react'
import { type ComponentProps, useMemo } from 'react'

import { $workingSessionIds } from '@/store/session-states'
import {
  $sidebarSettledOpen,
  $sidebarSnoozedOpen,
  $threadTriage,
  classify,
  setSidebarSettledOpen,
  setSidebarSnoozedOpen
} from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

import { SidebarSessionsSection } from './sessions-section'
import { useTriageCopy } from './triage-actions'

export interface TriageSplit {
  settled: SessionInfo[]
  snoozed: SessionInfo[]
  working: SessionInfo[]
}

/** Split recents into Working / Settled / Snoozed. Disabled = everything stays Working. */
export function useTriageSplit(sessions: SessionInfo[], enabled: boolean): TriageSplit {
  const triage = useStore($threadTriage)
  const workingIds = useStore($workingSessionIds)

  return useMemo(() => {
    if (!enabled) {
      return { settled: [], snoozed: [], working: sessions }
    }

    const now = Date.now()
    const out: TriageSplit = { settled: [], snoozed: [], working: [] }

    for (const session of sessions) {
      out[classify(session, triage, workingIds, now)].push(session)
    }

    return out
  }, [enabled, sessions, triage, workingIds])
}

type SectionProps = ComponentProps<typeof SidebarSessionsSection>

type SharedProps = Pick<
  SectionProps,
  | 'activeSessionId'
  | 'onArchiveSession'
  | 'onBranchSession'
  | 'onDeleteSession'
  | 'onResumeSession'
  | 'onTogglePin'
  | 'onToggleUnread'
>

/** Collapsible "Settled N" and "Snoozed N" sections rendered under the Working list. */
export function TriageSections({ split, ...shared }: SharedProps & { split: TriageSplit }) {
  const c = useTriageCopy()
  const settledOpen = useStore($sidebarSettledOpen)
  const snoozedOpen = useStore($sidebarSnoozedOpen)

  const section = (
    label: string,
    sessions: SessionInfo[],
    open: boolean,
    onToggle: () => void
  ) =>
    sessions.length > 0 && (
      <SidebarSessionsSection
        {...shared}
        collapsible
        contentClassName="flex max-h-72 flex-col gap-px overflow-y-auto pb-1.75"
        emptyState={null}
        label={`${label} ${sessions.length}`}
        onToggle={onToggle}
        open={open}
        pinned={false}
        rootClassName="shrink-0 p-0"
        sessions={sessions}
      />
    )

  return (
    <>
      {section(c.settled, split.settled, settledOpen, () => setSidebarSettledOpen(!settledOpen))}
      {section(c.snoozed, split.snoozed, snoozedOpen, () => setSidebarSnoozedOpen(!snoozedOpen))}
    </>
  )
}
