import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Monitor,
  Paperclip,
  PenLine,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { ACCESS_MODES, type AccessMode, type AccessModeOption } from './runtime-modes';

export interface MachineOption {
  id: string;
  name: string;
  description?: string;
  isCurrent?: boolean;
}

export interface T3ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  activeModel?: string;
  activeReasoning?: string;
  onOpenModelPicker?: () => void;
  machines?: MachineOption[];
  currentMachineId?: string;
  onSelectMachine?: (machineId: string) => void;
  accessMode?: AccessMode;
  onAccessModeChange?: (mode: AccessMode) => void;
  className?: string;
}

const ACCESS_MODE_ICONS: Record<AccessMode, typeof Shield> = {
  'approval-required': ShieldAlert,
  'auto-accept-edits': PenLine,
  auto: Sparkles,
  'full-access': Shield,
};

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);
  return ref;
}

function accessModeLabel(mode: AccessMode): string {
  return ACCESS_MODES.find((m) => m.id === mode)?.label ?? 'Full access';
}

/**
 * T3Hermes Composer Bar — replicates the T3 Code composer:
 * a cream card with auto-resizing textarea, attachment button,
 * model/reasoning badge, and a sub-bar with machine selector and
 * runtime access mode toggle.
 */
export function T3Composer({
  onSend,
  disabled = false,
  activeModel = 'opus-5.5',
  activeReasoning = 'Medium',
  onOpenModelPicker,
  machines = [],
  currentMachineId,
  onSelectMachine,
  accessMode = 'full-access',
  onAccessModeChange,
  className = '',
}: T3ComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [machineMenuOpen, setMachineMenuOpen] = useState(false);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const machineRef = useClickOutside<HTMLDivElement>(() => setMachineMenuOpen(false));
  const accessRef = useClickOutside<HTMLDivElement>(() => setAccessMenuOpen(false));
  const machineMenuId = useId();
  const accessMenuId = useId();

  const canSend = text.trim().length > 0 && !disabled && !sending;

  // Auto-resize the textarea to fit its content (up to a max height).
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  useEffect(resizeTextarea, [text, resizeTextarea]);

  const submit = useCallback(() => {
    if (!canSend) return;
    const value = text.trim();
    setSending(true);
    try {
      onSend(value);
      setText('');
    } finally {
      setSending(false);
    }
  }, [canSend, onSend, text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const currentMachine =
    machines.find((m) => m.id === currentMachineId) ??
    machines.find((m) => m.isCurrent);

  const AccessModeIcon = ACCESS_MODE_ICONS[accessMode] ?? Shield;

  const selectMachine = (id: string) => {
    setMachineMenuOpen(false);
    onSelectMachine?.(id);
  };

  const selectAccessMode = (mode: AccessMode) => {
    setAccessMenuOpen(false);
    onAccessModeChange?.(mode);
  };

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`}>
      {/* Composer card */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          aria-label="Message"
          placeholder="Ask anything. @ files, $ skills, / commands"
          className="max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* Bottom row inside the card */}
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
          <button
            type="button"
            aria-label="Attach file"
            title="Attach file"
            disabled={disabled}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip size={16} aria-hidden />
          </button>

          <div className="flex items-center gap-1.5">
            {/* Model + reasoning badge */}
            <button
              type="button"
              onClick={onOpenModelPicker}
              aria-haspopup="dialog"
              aria-label={`Model: ${activeModel}, reasoning: ${activeReasoning}. Change model.`}
              title={`${activeModel} · ${activeReasoning}`}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={13} aria-hidden />
              <span>
                {activeModel} {activeReasoning}
              </span>
            </button>

            {/* Submit */}
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send (Enter)"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp size={15} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-bar below the card */}
      <div className="flex items-center justify-between gap-2 px-1">
        {/* Machine selector */}
        <div ref={machineRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={machineMenuOpen}
            aria-controls={machineMenuId}
            onClick={() => setMachineMenuOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Monitor size={14} aria-hidden />
            <span>{currentMachine ? currentMachine.name : 'omarchy'}</span>
            <ChevronDown
              size={12}
              aria-hidden
              className={`transition-transform ${machineMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {machineMenuOpen && machines.length > 0 && (
            <ul
              id={machineMenuId}
              role="menu"
              aria-label="Select machine"
              className="absolute bottom-full left-0 z-20 mb-1 min-w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
            >
              {machines.map((machine) => (
                <li key={machine.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => selectMachine(machine.id)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <Check
                      size={13}
                      aria-hidden
                      className={`mt-0.5 shrink-0 ${
                        machine.id === currentMachine?.id ||
                        machine.id === currentMachineId
                          ? 'opacity-100'
                          : 'opacity-0'
                      }`}
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {machine.name}
                      </span>
                      {machine.description && (
                        <span className="text-muted-foreground">
                          {machine.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Runtime access mode */}
        <div ref={accessRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accessMenuOpen}
            aria-controls={accessMenuId}
            onClick={() => setAccessMenuOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <AccessModeIcon size={14} aria-hidden />
            <span>{accessModeLabel(accessMode)}</span>
            <ChevronDown
              size={12}
              aria-hidden
              className={`transition-transform ${accessMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {accessMenuOpen && (
            <ul
              id={accessMenuId}
              role="menu"
              aria-label="Select access mode"
              className="absolute bottom-full right-0 z-20 mb-1 min-w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
            >
              {ACCESS_MODES.map((mode: AccessModeOption) => {
                const ModeIcon = ACCESS_MODE_ICONS[mode.id] ?? Shield;
                return (
                  <li key={mode.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => selectAccessMode(mode.id)}
                      className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <ModeIcon
                        size={13}
                        aria-hidden
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {mode.label}
                        </span>
                        <span className="text-muted-foreground">
                          {mode.description}
                        </span>
                      </span>
                      {mode.id === accessMode && (
                        <Check size={13} aria-hidden className="mt-0.5 ml-auto shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default T3Composer;
