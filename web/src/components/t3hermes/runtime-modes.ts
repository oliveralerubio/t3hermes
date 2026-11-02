/**
 * Runtime access modes for T3Hermes, modeled after T3 Code.
 */

export type AccessMode =
  | 'approval-required'
  | 'auto-accept-edits'
  | 'auto'
  | 'full-access';

export interface RuntimeModeInfo {
  id: AccessMode;
  label: string;
  description: string;
  iconName: string;
}

export const RUNTIME_MODES: RuntimeModeInfo[] = [
  {
    id: 'approval-required',
    label: 'Supervised',
    description: 'Ask before commands and file changes.',
    iconName: 'ShieldAlert',
  },
  {
    id: 'auto-accept-edits',
    label: 'Auto-accept edits',
    description: 'Auto-approve edits, ask before other actions.',
    iconName: 'PenLine',
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Supported providers approve routine actions; others still ask.',
    iconName: 'Sparkles',
  },
  {
    id: 'full-access',
    label: 'Full access',
    description: 'Allow commands and edits without prompts.',
    iconName: 'Shield',
  },
];

// Aliases for compatibility with T3Composer
export type AccessModeOption = RuntimeModeInfo;
export const ACCESS_MODES: readonly RuntimeModeInfo[] = RUNTIME_MODES;
export const DEFAULT_ACCESS_MODE: AccessMode = 'full-access';
