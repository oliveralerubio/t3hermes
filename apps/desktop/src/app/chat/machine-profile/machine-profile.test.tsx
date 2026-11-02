import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COMPOSER_AREAS } from '@/app/chat/composer/contrib'
import { registry } from '@/contrib/registry'
import type { DesktopConnectionsRegistry } from '@/global'
import { I18nProvider } from '@/i18n'
import type { ProfileInfo } from '@/types/hermes'

import { MachinePicker } from './machine-picker'
import { MachineProfileBar } from './machine-profile-bar'
import { ProfilePicker } from './profile-picker'

// Radix menus use pointer capture; jsdom does not implement it.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined
globalThis.ResizeObserver ??= class ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

// The pickers paint the stores' published state; they never dial IPC. Mock the
// store modules with plain atoms so each test drives the exact snapshot.
vi.mock('@/store/connections', () => ({
  $activeConnectionId: atom<null | string>('local'),
  $connectionsRegistry: atom<DesktopConnectionsRegistry | null>(null),
  $pendingConnectionId: atom<null | string>(null),
  selectConnection: vi.fn(async () => undefined)
}))

vi.mock('@/store/profile', () => ({
  $activeGatewayProfile: atom('default'),
  $profileOrder: atom<string[]>([]),
  $profiles: atom<ProfileInfo[]>([]),
  normalizeProfileKey: (name: null | string | undefined) => (name ?? '').trim() || 'default',
  profileLabel: (profile: { display_name?: string; name: string }) =>
    (profile.display_name ?? '').trim() || profile.name,
  refreshProfiles: vi.fn(async () => []),
  setActiveProfile: vi.fn(),
  sortByProfileOrder: (items: Array<{ name: string }>, order: string[]) =>
    [...items].sort((left, right) => {
      const leftIndex = order.indexOf(left.name)
      const rightIndex = order.indexOf(right.name)

      if (leftIndex !== -1 && rightIndex !== -1) {
        return leftIndex - rightIndex
      }

      if (leftIndex !== -1) {
        return -1
      }

      if (rightIndex !== -1) {
        return 1
      }

      return left.name.localeCompare(right.name)
    })
}))

const connectionStore = await import('@/store/connections')
const profileStore = await import('@/store/profile')
const $activeConnectionId = connectionStore.$activeConnectionId as ReturnType<typeof atom<null | string>>
const $connectionsRegistry = connectionStore.$connectionsRegistry
const $pendingConnectionId = connectionStore.$pendingConnectionId
const selectConnection = vi.mocked(connectionStore.selectConnection)
const $profiles = profileStore.$profiles
const $profileOrder = profileStore.$profileOrder
const $activeGatewayProfile = profileStore.$activeGatewayProfile
const setActiveProfile = vi.mocked(profileStore.setActiveProfile)
const refreshProfiles = vi.mocked(profileStore.refreshProfiles)

const connection = (id: string, label: string, kind: 'local' | 'remote' = 'remote') => ({
  id,
  kind,
  label,
  tokenPreview: null,
  tokenSet: false
})

const registryWith = (connections: ReturnType<typeof connection>[]): DesktopConnectionsRegistry => ({
  connections,
  primary: connections[0]?.id ?? 'local',
  secureTokenStorage: true,
  version: 2
})

const profile = (name: string, overrides: { display_name?: string; is_default?: boolean } = {}): ProfileInfo => ({
  has_env: false,
  is_default: false,
  model: null,
  name,
  path: `/tmp/hermes-profiles/${name}`,
  provider: null,
  skill_count: 0,
  ...overrides
})

function renderWithProviders(ui: React.ReactNode) {
  return render(<I18nProvider configClient={null} initialLocale="en">{ui}</I18nProvider>)
}

const openMenu = (trigger: HTMLElement) => {
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  $connectionsRegistry.set(null)
  $activeConnectionId.set('local')
  $pendingConnectionId.set(null)
  $profiles.set([])
  $profileOrder.set([])
  $activeGatewayProfile.set('default')
})

describe('MachinePicker', () => {
  it('hides when only one machine is registered', () => {
    $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local')]))
    const { container } = renderWithProviders(<MachinePicker />)

    expect(container.firstElementChild).toBeNull()
  })

  it('renders the active machine and picks another through selectConnection', () => {
    $connectionsRegistry.set(
      registryWith([connection('local', 'This device', 'local'), connection('homelab', 'Homelab'), connection('work-vps', 'Work VPS')])
    )
    $activeConnectionId.set('local')
    renderWithProviders(<MachinePicker />)

    const trigger = screen.getByRole('button', { name: 'Switch machine: This device' })
    expect(trigger.textContent).toContain('This device')

    openMenu(trigger)

    // Local stays anchored, the rest in natural label order (the sidebar
    // switcher's sort), and the active machine is radio-checked.
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.map(row => row.textContent)).toEqual(['This device', 'Homelab', 'Work VPS'])
    expect(screen.getByRole('menuitemradio', { name: 'This device' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Homelab' }))
    expect(selectConnection).toHaveBeenCalledWith('homelab')
  })

  it('marks the pill busy while a connection switch is pending', () => {
    $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local'), connection('homelab', 'Homelab')]))
    $pendingConnectionId.set('homelab')
    renderWithProviders(<MachinePicker />)

    expect(screen.getByRole('button', { name: 'Switch machine: This device' }).getAttribute('aria-busy')).toBe('true')
  })
})

describe('ProfilePicker', () => {
  it('hides while fewer than two profiles exist', () => {
    $profiles.set([profile('default', { is_default: true })])
    const { container } = renderWithProviders(<ProfilePicker />)

    expect(container.firstElementChild).toBeNull()
  })

  it('labels the pill with the active profile and picks another through setActiveProfile', () => {
    $profiles.set([
      profile('default', { is_default: true }),
      profile('alpha'),
      profile('jobhunt', { display_name: 'Job Hunt' })
    ])
    $activeGatewayProfile.set('jobhunt')
    renderWithProviders(<ProfilePicker />)

    // display_name wins over the raw name, matching profileLabel().
    const trigger = screen.getByRole('button', { name: 'Switch profile: Job Hunt' })
    expect(trigger.textContent).toContain('Profile: Job Hunt')

    openMenu(trigger)

    // Default first, then rail order (unordered names alphabetise at the tail).
    expect(screen.getAllByRole('menuitemradio').map(row => row.textContent)).toEqual([
      'default',
      'alpha',
      'Job Hunt'
    ])
    expect(screen.getByRole('menuitemradio', { name: 'Job Hunt' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'alpha' }))
    expect(setActiveProfile).toHaveBeenCalledWith('alpha')
  })

  it('refreshes the profile list when the menu opens', () => {
    $profiles.set([profile('default', { is_default: true }), profile('alpha')])
    renderWithProviders(<ProfilePicker />)

    expect(refreshProfiles).not.toHaveBeenCalled()

    openMenu(screen.getByRole('button', { name: 'Switch profile: default' }))

    expect(refreshProfiles).toHaveBeenCalledTimes(1)
  })
})

describe('MachineProfileBar', () => {
  it('renders both pills when both have a choice to offer', () => {
    $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local'), connection('homelab', 'Homelab')]))
    $profiles.set([profile('default', { is_default: true }), profile('alpha')])
    const { container } = renderWithProviders(<MachineProfileBar />)

    const bar = container.querySelector('[data-slot="machine-profile-bar"]')
    expect(bar).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Switch machine: This device' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Switch profile: default' })).toBeTruthy()
  })

  it('stands down entirely for a single-machine, single-profile install', () => {
    $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local')]))
    $profiles.set([profile('default', { is_default: true })])
    const { container } = renderWithProviders(<MachineProfileBar />)

    expect(container.firstElementChild).toBeNull()
  })

  it('keeps a store-driven repainting honest when the registry grows', () => {
    $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local')]))
    const { container } = renderWithProviders(<MachineProfileBar />)

    expect(container.querySelector('[data-slot="machine-picker"]')).toBeNull()

    act(() => $connectionsRegistry.set(registryWith([connection('local', 'This device', 'local'), connection('homelab', 'Homelab')])))

    expect(container.querySelector('[data-slot="machine-picker"]')).toBeTruthy()
  })
})

describe('register', () => {
  it('contributes the bar to the composer bottom seam', async () => {
    await import('./register')

    const contributions = registry.getArea(COMPOSER_AREAS.bottom)
    const bar = contributions.find(contribution => contribution.id === 'machine-profile-bar')

    expect(bar).toBeTruthy()
    expect(typeof bar?.render).toBe('function')
  })
})
