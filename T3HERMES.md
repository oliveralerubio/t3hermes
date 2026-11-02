# Introducing T3Hermes ⚡

> **The speed and clarity of T3 Code, now in Hermes Agent.**

Hermes is one of the most flexible open-source AI agent frameworks available. But switching between different machines (e.g., local development on `omarchy`, remote VPS instances, cloud workers) and managing long lists of sessions often meant diving into menus or losing context.

**T3Hermes** brings the beloved workflow and visual language of **T3 Code** directly into the Hermes Web dashboard.

---

## ✨ Key Features

### 1. In-Composer Machine & Profile Switching
No more navigating to settings just to pick where your agent runs.
- **Machine Selector (`🖥 omarchy ▾`):** Switch effortlessly between your local setup, remote VPS (Contabo, etc.), or link a remote host right from the footer of the composer.
- **Model & Reasoning Badge (`✳ Opus 5.5 Medium`):** See and adjust your active model and thinking budget right beside the send button.
- **Runtime Access Modes:** One-click toggle between `Full access`, `Supervised`, `Auto-accept edits`, and `Auto`.
- **Clean Composer Card:** Generous padding, auto-resizing textarea, attachment clip, and circular submit button.

### 2. High-Productivity Sidebar: Working vs. Settled & Snooze
Turn your chat history into an actionable triage inbox:
- **"Working" Section:** Highlights threads with live activity or pending turns. Displays real-time elapsed time (e.g. `Working 3m`), target machine tag, and active model.
- **"Settled" Section:** Collapsible archive with full thread count. Keeps your focus on active work while preserving instant access to past chats with one click.
- **Snooze & Settle:** Hover over any thread to snooze it (for 1 hour or until tomorrow) or mark it settled once your task is done.
- **Bottom Navigation Toolbar:** Instant access to `/config`, Audio mute/unmute toggle, Analytics dashboard (`/analytics`), and a quick New Thread (`+`) button.

---

## 🛡️ Built for Zero-Conflict Upstream Updates

One of the biggest pain points with forking open-source agent interfaces is merge hell when the upstream repository updates.

T3Hermes is engineered with an **isolated component architecture**:
- All T3Hermes components live cleanly in `web/src/components/t3hermes/` and `web/src/lib/t3hermes/`.
- The upstream `ChatPage.tsx` has only a single high-level conditional slot (`<T3HermesView />`).
- Session states (Settled, Snoozed) persist in client storage (`localStorage`), requiring **zero backend database schema changes**.
- You can run `git pull upstream main` anytime and pull official Hermes updates smoothly without merge conflicts.

---

## 🚀 Getting Started

### 1. Clone & Setup
```bash
git clone https://github.com/oliveralerubio/t3hermes.git
cd t3hermes/web
npm install
```

### 2. Run in Development Mode
```bash
# In the repository root, start Hermes API
python -m hermes_cli.main web --no-open

# In web/ directory, launch Vite
npm run dev
```
Open `http://localhost:5173` to see T3Hermes in action!

### 3. Build for Production
```bash
npm run build
```
Assets are built directly to `hermes_cli/web_dist/` and served automatically by `hermes dashboard`.
