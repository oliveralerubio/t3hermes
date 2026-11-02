import { useStore } from '@nanostores/react'
import { memo, type ReactNode } from 'react'

import { ProfileTag } from '@/app/chat/profile-tag'
import { PlatformAvatar } from '@/app/messaging/platform-icon'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import type { DesktopRegistryConnection } from '@/global'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import { triggerHaptic } from '@/lib/haptics'
import { Cloud, Monitor, Network, Terminal } from '@/lib/icons'
import { isMessagingSource, normalizeSessionSource, sessionSourceLabel } from '@/lib/session-source'
import { coarseElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'
import { $connectionsRegistry } from '@/store/connection-registry-state'
import { normalizeProfileKey } from '@/store/profile'
import { settleSession, unsettleSession, unsnoozeSession } from '@/store/thread-triage'
import type { SessionInfo } from '@/types/hermes'

import { SessionActionsMenu, SessionContextMenu } from './session-actions-menu'
import { useTriageCopy } from './triage-actions'

export type T3CardVariant = 'main' | 'settled' | 'snoozed' | 'working'

const KIND_ICON = { cloud: Cloud, local: Monitor, ssh: Terminal } as const

const ACTION_BTN =
  'size-6 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground [&_svg]:size-3.5!'

/** Compact "3m" / "4h" / "2d" — T3 Code's right-aligned age. */
function useAge(session: SessionInfo): string {
  const { t } = useI18n()
  const r = t.sidebar.row
  const seconds = session.last_active || session.started_at
  const { unit, value } = coarseElapsed(Date.now() - seconds * 1000)

  if (unit === 'second') {
    return r.ageNow
  }

  return `${value}${unit === 'day' ? r.ageDay : unit === 'hour' ? r.ageHour : r.ageMin}`
}

function machineFor(session: SessionInfo, connections: DesktopRegistryConnection[]) {
  return session.connection_id
    ? connections.find(c => c.id === session.connection_id)
    : connections.find(c => c.kind === 'local')
}

/** Line 1 left: platform icon for messaging sessions, else the machine glyph + its label. */
function CardOrigin({ session }: { session: SessionInfo }) {
  const c = useTriageCopy()
  const connections = useStore($connectionsRegistry)?.connections ?? []
  const source = normalizeSessionSource(session.source)

  if (source && isMessagingSource(source)) {
    const label = sessionSourceLabel(source) ?? source

    return (
      <>
        <PlatformAvatar
          className="size-3.5 shrink-0 rounded-[3px] text-[0.5rem] [&_svg]:size-2.5"
          platformId={source}
          platformName={label}
        />
        <span className="truncate">{label}</span>
      </>
    )
  }

  const machine = machineFor(session, connections)
  const Icon = (machine && KIND_ICON[machine.kind as keyof typeof KIND_ICON]) || (machine ? Network : Monitor)

  return (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{machine?.label || c.thisDevice}</span>
    </>
  )
}

export interface T3ThreadCardProps {
  active: boolean
  onArchive?: () => void
  onBranch?: () => void
  onDelete?: () => void
  onPin?: () => void
  onSelect: () => void
  onToggleUnread?: () => void
  session: SessionInfo
  /** Right side of the meta line; defaults to the age. */
  status?: ReactNode
  variant?: T3CardVariant
}

/** T3 Code-style two-line thread card: meta (origin · age) over the title. */
export const T3ThreadCard = memo(function T3ThreadCard({
  active,
  onArchive,
  onBranch,
  onDelete,
  onPin,
  onSelect,
  onToggleUnread,
  session,
  status,
  variant = 'main'
}: T3ThreadCardProps) {
  const c = useTriageCopy()
  const age = useAge(session)
  const title = sessionTitle(session)

  const quick =
    variant === 'main'
      ? { icon: 'check', label: c.settle, run: () => settleSession(session.id) }
      : variant === 'settled'
        ? { icon: 'debug-restart', label: c.moveBack, run: () => unsettleSession(session.id) }
        : variant === 'snoozed'
          ? { icon: 'bell', label: c.unsnooze, run: () => unsnoozeSession(session.id) }
          : null

  return (
    <SessionContextMenu
      archived={Boolean(session.archived)}
      onArchive={onArchive}
      onBranch={onBranch}
      onDelete={onDelete}
      onPin={onPin}
      onToggleUnread={onToggleUnread}
      pinned={false}
      profile={session.profile}
      sessionId={session.id}
      title={title}
      unread={session.unread === true}
    >
      <div
        aria-selected={active}
        className={cn(
          'group row-hover relative flex min-h-12 cursor-pointer flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors select-none',
          'hover:bg-(--ui-control-hover-background)',
          active && 'bg-(--ui-row-active-background)'
        )}
        data-t3-card={variant}
        onClick={onSelect}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <CardOrigin session={session} />
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {normalizeProfileKey(session.profile) !== 'default' && <ProfileTag profile={session.profile} />}
            {status ?? age}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          {session.unread === true && (
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--ui-accent,currentColor)" />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm leading-5',
              active ? 'font-medium text-foreground' : 'text-(--ui-text-secondary) group-hover:text-foreground'
            )}
          >
            {title}
          </span>
        </div>
        <div
          className="absolute right-1.5 bottom-1 hidden items-center gap-0.5 rounded-md bg-(--ui-sidebar-surface-background) group-hover:flex group-focus-within:flex"
          data-row-actions
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          {quick && !session.archived && (
            <Tip label={quick.label}>
              <Button
                aria-label={quick.label}
                className={ACTION_BTN}
                onClick={() => {
                  triggerHaptic('selection')
                  quick.run()
                }}
                size="icon"
                variant="ghost"
              >
                <Codicon name={quick.icon} size="0.875rem" />
              </Button>
            </Tip>
          )}
          <SessionActionsMenu
            archived={Boolean(session.archived)}
            onArchive={onArchive}
            onBranch={onBranch}
            onDelete={onDelete}
            onPin={onPin}
            onToggleUnread={onToggleUnread}
            pinned={false}
            profile={session.profile}
            sessionId={session.id}
            title={title}
            unread={session.unread === true}
          >
            <Button aria-label="Actions" className={ACTION_BTN} size="icon" variant="ghost">
              <Codicon name="kebab-vertical" size="0.875rem" />
            </Button>
          </SessionActionsMenu>
        </div>
      </div>
    </SessionContextMenu>
  )
})

export interface T3ThreadListProps {
  activeSessionId: null | string
  emptyState?: ReactNode
  hasMore: boolean
  loadingMore: boolean
  onArchiveSession?: (id: string) => void
  onBranchSession?: (id: string) => void
  onDeleteSession?: (id: string) => void
  onLoadMore: () => void
  onResumeSession: (id: string, session?: SessionInfo) => void
  onTogglePin?: (id: string) => void
  onToggleUnread?: (id: string) => void
  sessions: SessionInfo[]
}

/** One flat, recency-sorted list of the triage "main" threads: no header, no date dividers. */
export function T3ThreadList({
  activeSessionId,
  emptyState,
  hasMore,
  loadingMore,
  onArchiveSession,
  onBranchSession,
  onDeleteSession,
  onLoadMore,
  onResumeSession,
  onTogglePin,
  onToggleUnread,
  sessions
}: T3ThreadListProps) {
  const { t } = useI18n()

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain px-1 py-1 scrollbar-fade"
      data-t3-thread-list
    >
      {sessions.length === 0 && emptyState}
      {sessions.map(session => (
        <T3ThreadCard
          active={session.id === activeSessionId}
          key={`${session.profile ?? ''}::${session.id}`}
          onArchive={onArchiveSession ? () => onArchiveSession(session.id) : undefined}
          onBranch={onBranchSession ? () => onBranchSession(session.id) : undefined}
          onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
          onPin={onTogglePin ? () => onTogglePin(session.id) : undefined}
          onSelect={() => onResumeSession(session.id, session)}
          onToggleUnread={onToggleUnread ? () => onToggleUnread(session.id) : undefined}
          session={session}
        />
      ))}
      {hasMore && (
        <button
          className="h-8 shrink-0 rounded-md text-xs text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:cursor-default disabled:opacity-60"
          disabled={loadingMore}
          onClick={onLoadMore}
          type="button"
        >
          {loadingMore ? t.sidebar.loading : t.sidebar.loadMore}
        </button>
      )}
    </div>
  )
}
