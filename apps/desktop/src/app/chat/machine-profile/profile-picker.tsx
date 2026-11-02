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
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import {
  $activeGatewayProfile,
  $profileOrder,
  $profiles,
  normalizeProfileKey,
  profileLabel,
  refreshProfiles,
  setActiveProfile,
  sortByProfileOrder
} from '@/store/profile'

import { MACHINE_PROFILE_PILL } from './pill'

/**
 * The profile pill — pick which Hermes profile the chat runs on before
 * sending. Mirrors the sidebar's dropdown switcher (default first, then the
 * rail's drag order), labelled with the display_name-aware profileLabel, and
 * re-fetches on open so a profile created elsewhere shows up.
 */
export function ProfilePicker() {
  const copy = useI18n().t.composer.machineProfile
  const profiles = useStore($profiles)
  const order = useStore($profileOrder)
  const gatewayProfile = useStore($activeGatewayProfile)

  // A single profile is not a choice; the pill stays out of the row.
  if (profiles.length < 2) {
    return null
  }

  const named = sortByProfileOrder(
    profiles.filter(profile => !profile.is_default),
    order
  )

  const defaultProfile = profiles.find(profile => profile.is_default)
  const ordered = defaultProfile ? [defaultProfile, ...named] : named

  const activeKey = normalizeProfileKey(gatewayProfile)
  const active = profiles.find(profile => normalizeProfileKey(profile.name) === activeKey)
  const label = active ? profileLabel(active) : activeKey

  // Re-fetch on open, same as the sidebar picker: a profile created in the
  // CLI or another window appears without a restart. A failed refresh keeps
  // the cached list — the pill degrades, it never blanks.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      void refreshProfiles().catch(() => undefined)
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <Tip label={copy.switchProfile} side="top">
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${copy.switchProfile}: ${label}`}
            className={MACHINE_PROFILE_PILL}
            data-slot="profile-picker"
            type="button"
            variant="ghost"
          >
            <span className="truncate">{copy.profileWith(label)}</span>
            <Codicon className="size-2.5 shrink-0 opacity-50" name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" aria-label={copy.profiles} className="min-w-44" side="top" sideOffset={8}>
        <DropdownMenuRadioGroup onValueChange={setActiveProfile} value={active?.name ?? ''}>
          {ordered.map(profile => (
            <DropdownMenuRadioItem className="min-w-0" key={profile.name} value={profile.name}>
              <span className="truncate">{profileLabel(profile)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
