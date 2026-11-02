import { useStore } from '@nanostores/react'

import { $connectionsRegistry } from '@/store/connections'
import { $profiles } from '@/store/profile'

import { MachinePicker } from './machine-picker'
import { ProfilePicker } from './profile-picker'

/**
 * The composer's machine + profile bar: which machine (registered connection)
 * and which Hermes profile the chat runs on, picked before sending. Rendered
 * through the composer's bottom contribution seam; each pill hides itself
 * when it has no choice to offer, and the whole bar stands down when neither
 * does — a single-machine, single-profile install sees nothing new.
 */
export function MachineProfileBar() {
  const registry = useStore($connectionsRegistry)
  const profiles = useStore($profiles)

  const machines = registry?.connections ?? []

  if (machines.length <= 1 && profiles.length < 2) {
    return null
  }

  return (
    <div
      className="flex min-w-0 shrink items-center gap-(--composer-control-gap)"
      data-slot="machine-profile-bar"
    >
      <MachinePicker />
      <ProfilePicker />
    </div>
  )
}
