import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Terminal } from "@xterm/xterm";

import { T3Composer, type MachineOption } from "./T3Composer";
import { T3Sidebar } from "./T3Sidebar";
import { DEFAULT_ACCESS_MODE, type AccessMode } from "./runtime-modes";
import { api, type ProfileInfo } from "@/lib/api";
import { useProfileScope } from "@/contexts/useProfileScope";
import { cn } from "@/lib/utils";

export interface T3HermesViewProps {
  /** The terminal element and its overlays */
  children?: ReactNode;
  /** Active Terminal instance ref for sending text */
  termRef?: RefObject<Terminal | null>;
  /** Active PTY WebSocket ref for direct write */
  wsRef?: RefObject<WebSocket | null>;
  /** Explicit callback to forward text to PTY */
  onSendToPty?: (text: string) => void;
  /** Currently active resumed session ID */
  activeSessionId: string | null;
  /** Whether the chat tab is currently active */
  isActive?: boolean;
  /** Active management profile */
  profile?: string;
  /** Callback when user changes active profile / machine */
  onProfileChange?: (profile: string) => void;
  /** Start a fresh session */
  onNewChat?: () => void;
  /** Open settings callback */
  onOpenSettings?: () => void;
  /** Current workspace folder */
  workspaceCwd?: string;
  /** Workspace changed */
  onWorkspaceChange?: (cwd: string) => void;
  /** Whether the desktop side panel is collapsed */
  chatPanelCollapsed?: boolean;
  /** Toggle panel collapse */
  onToggleChatPanel?: () => void;
  /** Mobile / narrow screen indicator */
  narrow?: boolean;
  /** Optional slot for model picker / title card above the sidebar */
  modelPickerSlot?: ReactNode;
  /** Open model picker dialog */
  onOpenModelPicker?: () => void;
  className?: string;
}

/**
 * T3HermesView — Unified container coordinating T3Sidebar and T3Composer.
 *
 * It wraps the active terminal window, mounts the T3Composer right below it,
 * manages machine/profile discovery via `api.getProfiles()`, and provides
 * the T3Sidebar thread list.
 */
export function T3HermesView({
  children,
  termRef,
  wsRef,
  onSendToPty,
  activeSessionId,
  isActive = true,
  profile,
  onProfileChange,
  onNewChat,
  onOpenSettings,
  workspaceCwd,
  onWorkspaceChange,
  chatPanelCollapsed = false,
  narrow = false,
  modelPickerSlot,
  onOpenModelPicker,
  className = "",
}: T3HermesViewProps) {
  const profileScope = useProfileScope();
  const effectiveProfile = profile ?? profileScope.profile ?? "";

  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeModel, setActiveModel] = useState<string>("Hermes");
  const [activeReasoning] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("hermes_reasoning_effort");
      if (stored) {
        return stored.charAt(0).toUpperCase() + stored.slice(1);
      }
    } catch {
      // Ignore
    }
    return "Medium";
  });
  const [accessMode, setAccessMode] = useState<AccessMode>(DEFAULT_ACCESS_MODE);

  // Load profiles / machines on mount or when effective profile changes
  useEffect(() => {
    let unmounted = false;
    api
      .getProfiles()
      .then((res) => {
        if (!unmounted && res.profiles) {
          setProfiles(res.profiles);
        }
      })
      .catch((err) => {
        console.warn("[T3HermesView] Failed to load profiles:", err);
      });
    return () => {
      unmounted = true;
    };
  }, [effectiveProfile]);

  // Read current model info for the badge
  useEffect(() => {
    let unmounted = false;
    api
      .getModelInfo(effectiveProfile)
      .then((res) => {
        if (!unmounted && res.model) {
          const shortName = res.model.split("/").pop() || res.model;
          setActiveModel(shortName);
        }
      })
      .catch(() => {
        // Fall back to default
      });
    return () => {
      unmounted = true;
    };
  }, [effectiveProfile]);

  // Format profiles into MachineOption items for T3Composer
  const machineOptions = useMemo<MachineOption[]>(() => {
    const currentId = effectiveProfile || "default";

    const list: MachineOption[] = profiles.map((p) => ({
      id: p.name,
      name: p.display_name || p.name,
      description:
        p.description ||
        (p.model ? `Model: ${p.model}` : p.is_default ? "Default profile" : undefined),
      isCurrent: p.name === currentId || (currentId === "" && p.is_default),
    }));

    // If no profiles loaded yet, provide localhost default
    if (list.length === 0) {
      list.push({
        id: "default",
        name: "localhost",
        description: "Default machine",
        isCurrent: true,
      });
    }

    // Remote machine prompt option
    list.push({
      id: "__add_remote__",
      name: "+ Remote host...",
      description: "Connect to a remote host or VM",
    });

    return list;
  }, [effectiveProfile, profiles]);

  // Handle switching machines
  const handleSelectMachine = useCallback(
    (machineId: string) => {
      if (machineId === "__add_remote__") {
        const host = window.prompt(
          "Enter remote host (e.g. user@host:port, SSH alias, or daemon URL):"
        );
        if (host && host.trim()) {
          alert(`Connecting to remote host ${host.trim()}... (configured in /config)`);
        }
        return;
      }

      if (onProfileChange) {
        onProfileChange(machineId);
      } else if (profileScope?.setProfile) {
        profileScope.setProfile(machineId);
      }

      // Persist active profile if supported
      api.setActiveProfile(machineId).catch(() => {});
    },
    [onProfileChange, profileScope]
  );

  // Write text + \r to PTY
  const handleSend = useCallback(
    (text: string) => {
      if (!text) return;

      if (onSendToPty) {
        onSendToPty(text);
        return;
      }

      // Send to WebSocket if connected
      if (wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(text + "\r");
        return;
      }

      // Send through xterm terminal paste
      if (termRef?.current) {
        termRef.current.paste(text + "\r");
        return;
      }

      console.warn("[T3HermesView] No active PTY socket or terminal to send input.");
    },
    [onSendToPty, wsRef, termRef]
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-3",
        className
      )}
    >
      {/* Main Terminal Column + Composer */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Terminal Window Box */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>

        {/* T3Composer Bar right below the terminal window */}
        <div className="shrink-0">
          <T3Composer
            onSend={handleSend}
            activeModel={activeModel}
            activeReasoning={activeReasoning}
            onOpenModelPicker={onOpenModelPicker}
            machines={machineOptions}
            currentMachineId={effectiveProfile || "default"}
            onSelectMachine={handleSelectMachine}
            accessMode={accessMode}
            onAccessModeChange={setAccessMode}
          />
        </div>
      </div>

      {/* T3Hermes Sidebar (Replaces default ChatSessionList) */}
      {!narrow && !chatPanelCollapsed && (
        <div
          id="chat-side-panel"
          role="complementary"
          aria-label="T3Hermes sidebar"
          className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden lg:h-full lg:w-64"
        >
          {modelPickerSlot && (
            <div className="shrink-0">{modelPickerSlot}</div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-current/10 bg-background-base">
            <T3Sidebar
              activeSessionId={activeSessionId}
              isActive={isActive}
              profile={effectiveProfile}
              onNewChat={onNewChat}
              onOpenSettings={onOpenSettings}
              workspaceCwd={workspaceCwd}
              onWorkspaceChange={onWorkspaceChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { T3Sidebar, T3Composer };
