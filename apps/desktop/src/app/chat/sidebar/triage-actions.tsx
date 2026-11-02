import type { ActionItemSpec } from '@/components/ui/actions-menu'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { useStoreSelector } from '@/lib/use-session-slice'
import {
  $threadTriage,
  classify,
  settleSession,
  snoozeOneHourMs,
  snoozeSession,
  snoozeUntilTomorrowMs,
  type ThreadTriageBucket,
  unsettleSession,
  unsnoozeSession
} from '@/store/thread-triage'

// Fallback copy keeps locales / test doubles without the `triage` block working.
const FALLBACK = {
  allCaughtUp: 'All caught up',
  moveBack: 'Move back',
  moveToWorking: 'Move back to Working',
  settle: 'Settle',
  settled: 'Settled',
  snooze1h: 'Snooze 1 hour',
  snoozed: 'Snoozed',
  snoozeTomorrow: 'Snooze until tomorrow',
  unsnooze: 'Unsnooze',
  working: 'Working',
  workingFor: (time: string) => `Working ${time}`
}

export function useTriageCopy() {
  const { t } = useI18n()

  return { ...FALLBACK, ...(t.sidebar as { triage?: Partial<typeof FALLBACK> } | undefined)?.triage }
}

/** Context-menu items for a row (Settle / Snooze / Unsnooze / Move back to Working). */
export function useTriageMenuItems(sessionId: string, enabled: boolean): ActionItemSpec[] {
  const c = useTriageCopy()
  const bucket = useStoreSelector($threadTriage, triage => classify(sessionId, triage))

  if (!enabled || !sessionId) {
    return []
  }

  const act = (fn: () => void) => () => {
    triggerHaptic('selection')
    fn()
  }

  const snooze: ActionItemSpec[] = [
    { icon: 'bell-slash', label: c.snooze1h, onSelect: act(() => snoozeSession(sessionId, snoozeOneHourMs())) },
    {
      icon: 'calendar',
      label: c.snoozeTomorrow,
      onSelect: act(() => snoozeSession(sessionId, snoozeUntilTomorrowMs()))
    }
  ]

  if (bucket === 'snoozed') {
    return [{ icon: 'bell', label: c.unsnooze, onSelect: act(() => unsnoozeSession(sessionId)) }]
  }

  // A running turn has nothing to settle yet.
  if (bucket === 'working') {
    return []
  }

  return bucket === 'settled'
    ? [{ icon: 'debug-restart', label: c.moveBack, onSelect: act(() => unsettleSession(sessionId)) }, ...snooze]
    : [{ icon: 'check', label: c.settle, onSelect: act(() => settleSession(sessionId)) }, ...snooze]
}

/** Small hover-only "Settle" button for Working rows; sits left of the kebab. */
export function TriageHoverButton({ sessionId }: { sessionId: string }) {
  const c = useTriageCopy()
  const bucket: ThreadTriageBucket = useStoreSelector($threadTriage, triage => classify(sessionId, triage))

  if (bucket !== 'main') {
    return null
  }

  return (
    <Tip label={c.settle}>
      <Button
        aria-label={c.settle}
        className="absolute right-6 hidden size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground group-hover:inline-flex [&_svg]:size-3.5!"
        onClick={() => {
          triggerHaptic('selection')
          settleSession(sessionId)
        }}
        size="icon"
        variant="ghost"
      >
        <Codicon name="check" size="0.875rem" />
      </Button>
    </Tip>
  )
}
