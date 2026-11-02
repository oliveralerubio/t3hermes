/**
 * Thread classification logic for T3Hermes, modeled directly after T3 Code.
 *
 * In T3 Code:
 * - "Snoozed": thread has snoozedUntil > now.
 * - "Settled": thread is explicitly marked settled (settledAt / settledOverride)
 *              or has had no activity and is marked settled, with no newer messages.
 * - "Working": thread is actively running or currently engaged.
 */

export interface ThreadUserState {
  settledIds: Record<string, boolean>; // id -> isSettled
  snoozedUntil: Record<string, number>; // id -> epoch timestamp ms
}

export interface MinimalSession {
  id: string;
  updated_at?: number | string;
  status?: string;
  is_active?: boolean;
}

/**
 * Classifies a chat session into 'working', 'settled', or 'snoozed'.
 */
export function classifyThreadState(
  session: MinimalSession,
  userState: ThreadUserState,
  nowMs: number = Date.now()
): 'working' | 'settled' | 'snoozed' {
  // 1. Snoozed check: has an active future snooze timestamp
  const snoozeTimestamp = userState.snoozedUntil?.[session.id];
  if (snoozeTimestamp && snoozeTimestamp > nowMs) {
    return 'snoozed';
  }

  // 2. Active run check: if session is explicitly active or running, it must stay in Working
  if (session.is_active || session.status === 'running') {
    return 'working';
  }

  // 3. User override: if the user explicitly settled this thread, it's Settled
  if (userState.settledIds?.[session.id]) {
    return 'settled';
  }

  // Default: un-settled threads are considered working
  return 'working';
}

/**
 * Helper to update settled state for a thread.
 */
export function toggleThreadSettled(
  threadId: string,
  currentState: ThreadUserState
): ThreadUserState {
  const isCurrentlySettled = !!currentState.settledIds[threadId];
  const nextSettled = { ...currentState.settledIds };
  if (isCurrentlySettled) {
    delete nextSettled[threadId];
  } else {
    nextSettled[threadId] = true;
  }
  return {
    ...currentState,
    settledIds: nextSettled,
  };
}

/**
 * Helper to snooze a thread until a specified duration from now (in ms).
 */
export function snoozeThread(
  threadId: string,
  durationMs: number,
  currentState: ThreadUserState,
  nowMs: number = Date.now()
): ThreadUserState {
  return {
    ...currentState,
    snoozedUntil: {
      ...currentState.snoozedUntil,
      [threadId]: nowMs + durationMs,
    },
  };
}

/**
 * Helper to unsnooze a thread.
 */
export function unsnoozeThread(
  threadId: string,
  currentState: ThreadUserState
): ThreadUserState {
  const nextSnooze = { ...currentState.snoozedUntil };
  delete nextSnooze[threadId];
  return {
    ...currentState,
    snoozedUntil: nextSnooze,
  };
}
