import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { Tip } from '@/components/ui/tooltip'
import type { DesktopConnectionKind } from '@/global'
import { useI18n } from '@/i18n'
import { sortConnectionsForDisplay } from '@/lib/connection-display'
import { $activeConnectionId, $connectionsRegistry, $pendingConnectionId, selectConnection } from '@/store/connections'
import { notifyError } from '@/store/notifications'

import { MACHINE_PROFILE_PILL } from './pill'

// One Codicon per connection kind so a machine reads the same in the pill and
// in its menu rows (the vocabulary the sidebar's ConnectionGlyph paints with
// Tabler icons; this compact composer surface speaks Codicon instead).
const KIND_ICONS: Record<DesktopConnectionKind, string> = {
  cloud: 'cloud',
  local: 'device-desktop',
  remote: 'remote',
  ssh: 'terminal'
}

/**
 * The machine (connection) pill — pick which registered agent source the chat
 * runs on before sending. Reads the same registry the sidebar's connection
 * switcher does; a single registered machine is no choice to offer, so the
 * pill stays out of the row entirely.
 */
export function MachinePicker() {
  const copy = useI18n().t.composer.machineProfile
  const registry = useStore($connectionsRegistry)
  const activeConnectionId = useStore($activeConnectionId)
  const pendingConnectionId = useStore($pendingConnectionId)

  const connections = sortConnectionsForDisplay(registry?.connections ?? [])

  if (connections.length <= 1) {
    return null
  }

  const active = connections.find(connection => connection.id === activeConnectionId)
  const label = active?.label ?? copy.machines
  const pending = pendingConnectionId !== null

  const choose = (connectionId: string) => {
    void selectConnection(connectionId).catch(error => notifyError(error, copy.switchMachineFailed(label)))
  }

  return (
    <DropdownMenu>
      <Tip label={copy.switchMachine} side="top">
        <DropdownMenuTrigger asChild>
          <Button
            aria-busy={pending}
            aria-label={`${copy.switchMachine}: ${label}`}
            className={MACHINE_PROFILE_PILL}
            data-slot="machine-picker"
            type="button"
            variant="ghost"
          >
            {pending ? (
              <GlyphSpinner className="shrink-0 opacity-50" spinner="braille" />
            ) : (
              <Codicon className="shrink-0" name={KIND_ICONS[active?.kind ?? 'local']} size="0.875rem" />
            )}
            <span className="truncate">{label}</span>
            <Codicon className="size-2.5 shrink-0 opacity-50" name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" aria-label={copy.machines} className="min-w-44" side="top" sideOffset={8}>
        <DropdownMenuRadioGroup onValueChange={choose} value={activeConnectionId ?? ''}>
          {connections.map(connection => (
            <DropdownMenuRadioItem className="min-w-0" key={connection.id} value={connection.id}>
              <Codicon className="shrink-0 text-(--ui-text-tertiary)" name={KIND_ICONS[connection.kind]} size="0.875rem" />
              <span className="truncate">{connection.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
