import { cn } from '@/lib/utils'

// The compact pill chrome the composer's controls wear (the same shape as
// ModelPill's PILL in model-pill.tsx), kept in its own module so both pickers
// share one definition without importing each other's component tree.
//
// Height follows the composer's own control token (`--composer-control-size`),
// so the pickers match the row they join on every surface — 44px touch targets
// in the browser-hosted Desktop, the compact native stage otherwise.
export const MACHINE_PROFILE_PILL = cn(
  'h-(--composer-control-size) min-w-0 shrink gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)
