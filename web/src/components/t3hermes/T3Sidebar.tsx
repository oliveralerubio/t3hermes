import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Laptop,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Terminal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { api, type SessionInfo } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import {
  classifyThreadState,
  snoozeThread,
  toggleThreadSettled,
  type ThreadUserState,
} from "@/lib/t3hermes/thread-classification";

export interface T3SidebarProps {
  activeSessionId: string | null;
  isActive?: boolean;
  profile?: string;
  className?: string;
  onPicked?: () => void;
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  workspaceCwd?: string;
  onWorkspaceChange?: (cwd: string) => void;
}

const SESSION_LIMIT = 50;
const SESSION_REFRESH_MS = 20_000;
const THREAD_STATE_STORAGE_KEY = "t3hermes_thread_state";
const AUDIO_MUTED_STORAGE_KEY = "t3hermes_audio_muted";

function loadThreadUserState(): ThreadUserState {
  try {
    const raw = localStorage.getItem(THREAD_STATE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        settledIds: parsed.settledIds || {},
        snoozedUntil: parsed.snoozedUntil || {},
      };
    }
  } catch {
    // Fall back to clean state
  }
  return { settledIds: {}, snoozedUntil: {} };
}

function saveThreadUserState(state: ThreadUserState) {
  try {
    localStorage.setItem(THREAD_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function rowTitle(session: SessionInfo): string {
  const title = session.title?.trim();
  if (title && title !== "Untitled") return title;
  const preview = session.preview?.trim();
  if (preview) return preview;
  return "Untitled thread";
}

export function T3Sidebar({
  activeSessionId,
  isActive = true,
  profile,
  className = "",
  onPicked,
  onNewChat,
  onOpenSettings,
}: T3SidebarProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Search filter query
  const [searchQuery, setSearchQuery] = useState("");

  // Settled section collapsible state
  const [settledOpen, setSettledOpen] = useState(false);

  // Audio mute state
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(AUDIO_MUTED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // User classification overrides
  const [userState, setUserState] = useState<ThreadUserState>(loadThreadUserState);

  const scopeKey = profile ?? "";
  const reqRef = useRef(0);

  const load = useCallback(() => {
    const myReq = ++reqRef.current;
    setLoading(true);
    setError(null);
    api
      .getSessions(SESSION_LIMIT, 0, scopeKey, "recent")
      .then((res) => {
        if (reqRef.current !== myReq) return;
        setSessions(res.sessions);
      })
      .catch((e: Error) => {
        if (reqRef.current !== myReq) return;
        setError(e.message || "Failed to load sessions");
      })
      .finally(() => {
        if (reqRef.current === myReq) setLoading(false);
      });
  }, [scopeKey]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isActive) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [isActive, load, reloadNonce]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(reload, SESSION_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isActive, reload]);

  // Persist user overrides on change
  const updateUserState = useCallback((updater: (prev: ThreadUserState) => ThreadUserState) => {
    setUserState((prev) => {
      const next = updater(prev);
      saveThreadUserState(next);
      return next;
    });
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      onPicked?.();
      if (id === activeSessionId) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("resume", id);
          return next;
        },
        { replace: false }
      );
    },
    [activeSessionId, onPicked, setSearchParams]
  );

  const handleStartNew = useCallback(() => {
    onPicked?.();
    if (onNewChat) {
      onNewChat();
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("resume");
        return next;
      },
      { replace: false }
    );
  }, [onNewChat, onPicked, setSearchParams]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const handleOpenSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      navigate("/config");
    }
  }, [navigate, onOpenSettings]);

  const handleOpenAnalytics = useCallback(() => {
    navigate("/analytics");
  }, [navigate]);

  // Settle / Unsettle
  const handleToggleSettle = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      updateUserState((s) => toggleThreadSettled(id, s));
    },
    [updateUserState]
  );

  // Snooze 1 hour
  const handleSnooze1h = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const ONE_HOUR_MS = 60 * 60 * 1000;
      updateUserState((s) => snoozeThread(id, ONE_HOUR_MS, s));
    },
    [updateUserState]
  );

  // Filter & categorize sessions
  const { workingSessions, settledSessions, snoozedCount } = useMemo(() => {
    if (!sessions) return { workingSessions: [], settledSessions: [], snoozedCount: 0 };

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? sessions.filter(
          (s) =>
            s.title?.toLowerCase().includes(query) ||
            s.preview?.toLowerCase().includes(query) ||
            s.id.toLowerCase().includes(query)
        )
      : sessions;

    const working: SessionInfo[] = [];
    const settled: SessionInfo[] = [];
    let snoozed = 0;

    for (const session of filtered) {
      const state = classifyThreadState(
        {
          id: session.id,
          updated_at: session.last_active,
          is_active: session.id === activeSessionId,
        },
        userState
      );

      if (state === "snoozed") {
        snoozed++;
      } else if (state === "settled") {
        settled.push(session);
      } else {
        working.push(session);
      }
    }

    return { workingSessions: working, settledSessions: settled, snoozedCount: snoozed };
  }, [activeSessionId, searchQuery, sessions, userState]);

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col select-none overflow-hidden bg-background-base text-midground text-xs font-sans",
        className
      )}
    >
      {/* Top Header & Brand */}
      <div className="flex shrink-0 items-center justify-between border-b border-current/10 px-3 py-2.5">
        <div className="flex items-center gap-1.5 font-semibold text-foreground tracking-tight">
          <Terminal className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-bold tracking-wide">T3Hermes</span>
        </div>
        <button
          onClick={handleStartNew}
          title="New thread"
          className="flex h-6 w-6 items-center justify-center rounded border border-current/20 text-text-secondary hover:border-current/40 hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="shrink-0 px-3 py-2 border-b border-current/10">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search threads..."
            className="w-full rounded bg-current/5 py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-text-secondary/70 focus:bg-current/10 focus:outline-none transition-colors border border-transparent focus:border-current/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-text-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Thread Lists */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {loading && !sessions && (
          <div className="flex items-center justify-center gap-2 py-8 text-text-secondary">
            <Spinner /> Loading threads...
          </div>
        )}

        {error && (
          <div className="px-2 py-3 text-center text-xs text-rose-500">
            {error}
            <button
              onClick={reload}
              className="mt-1 block mx-auto underline text-text-secondary hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {/* Working Section */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-medium tracking-wider text-text-secondary uppercase">
            <span>Working</span>
            <span className="text-[10px] font-mono opacity-60">
              {workingSessions.length}
            </span>
          </div>

          <div className="space-y-0.5">
            {workingSessions.length === 0 && !loading && (
              <div className="px-2 py-3 text-center text-[11px] text-text-secondary/60">
                No active working threads
              </div>
            )}

            {workingSessions.map((session) => {
              const isSelected = session.id === activeSessionId;
              const title = rowTitle(session);
              const elapsed = timeAgo(session.last_active);

              return (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    "group relative flex flex-col gap-1 rounded-md px-2.5 py-2 cursor-pointer transition-colors border",
                    isSelected
                      ? "bg-current/10 border-current/20 text-foreground font-medium"
                      : "border-transparent hover:bg-current/5 text-midground"
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-xs leading-snug">{title}</span>
                  </div>

                  {/* Metadata & Badges */}
                  <div className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-2.5 w-2.5 opacity-70" />
                      {elapsed}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="flex items-center gap-1">
                      <Laptop className="h-2.5 w-2.5 opacity-70" />
                      {profile || "local"}
                    </span>
                    {session.model && (
                      <>
                        <span className="opacity-40">•</span>
                        <span className="truncate max-w-[80px] font-mono opacity-80">
                          {session.model.split("/").pop()}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Hover Quick-Actions (Settle / Snooze) */}
                  <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex bg-background-base/90 rounded px-1 py-0.5 shadow-sm border border-current/10">
                    <button
                      onClick={(e) => handleToggleSettle(e, session.id)}
                      title="Mark as Settled"
                      className="p-0.5 rounded text-text-secondary hover:text-emerald-500 hover:bg-current/5 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleSnooze1h(e, session.id)}
                      title="Snooze 1h"
                      className="p-0.5 rounded text-text-secondary hover:text-amber-500 hover:bg-current/5 transition-colors"
                    >
                      <Moon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settled Section (Collapsible) */}
        <div>
          <button
            onClick={() => setSettledOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-medium tracking-wider text-text-secondary hover:text-foreground uppercase transition-colors"
          >
            <div className="flex items-center gap-1">
              {settledOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>Settled</span>
            </div>
            <span className="text-[10px] font-mono opacity-60">
              {settledSessions.length}
            </span>
          </button>

          {settledOpen && (
            <div className="space-y-0.5 pt-1">
              {settledSessions.length === 0 ? (
                <div className="px-2 py-2 text-center text-[11px] text-text-secondary/60">
                  No settled threads
                </div>
              ) : (
                settledSessions.map((session) => {
                  const isSelected = session.id === activeSessionId;
                  const title = rowTitle(session);

                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSelectSession(session.id)}
                      className={cn(
                        "group relative flex items-center justify-between rounded-md px-2.5 py-1.5 cursor-pointer transition-colors border",
                        isSelected
                          ? "bg-current/10 border-current/20 text-foreground"
                          : "border-transparent hover:bg-current/5 text-text-secondary hover:text-midground"
                      )}
                    >
                      <span className="truncate text-xs pr-6">{title}</span>

                      {/* Restore action */}
                      <button
                        onClick={(e) => handleToggleSettle(e, session.id)}
                        title="Move back to Working"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-secondary hover:text-foreground transition-opacity"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Snoozed Summary (if any) */}
        {snoozedCount > 0 && (
          <div className="px-2 py-1 text-[10px] text-text-secondary/70 italic flex items-center gap-1">
            <Moon className="h-2.5 w-2.5" />
            <span>{snoozedCount} thread(s) currently snoozed</span>
          </div>
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="shrink-0 flex items-center justify-around border-t border-current/10 px-2 py-2 bg-background-base">
        <button
          onClick={handleOpenSettings}
          title="Settings (/config)"
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:text-foreground hover:bg-current/5 transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>

        <button
          onClick={toggleMute}
          title={isMuted ? "Unmute audio" : "Mute audio"}
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:text-foreground hover:bg-current/5 transition-colors"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4 text-amber-500" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={handleOpenAnalytics}
          title="Analytics (/analytics)"
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:text-foreground hover:bg-current/5 transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
        </button>

        <button
          onClick={handleStartNew}
          title="New thread"
          className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:text-foreground hover:bg-current/5 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
