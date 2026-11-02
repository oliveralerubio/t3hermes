import { COMPOSER_AREAS } from '@/app/chat/composer/contrib'
import { registry } from '@/contrib/registry'

import { MachineProfileBar } from './machine-profile-bar'

/** Stable contribution id in the composer's bottom seam. */
export const MACHINE_PROFILE_BAR_ID = 'machine-profile-bar'

// Registration runs at import time: the composer pulls this module in with a
// single side-effect import (see composer/index.tsx), the same seam every
// plugin contribution rides. The registry dedupes by id, so a hot reload
// re-registering is a replace, not a duplicate.
registry.register({
  area: COMPOSER_AREAS.bottom,
  id: MACHINE_PROFILE_BAR_ID,
  render: () => <MachineProfileBar />
})
