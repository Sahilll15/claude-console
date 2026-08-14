# claude-console

A local web dashboard for browsing and resuming your Claude Code sessions.

It scans the session transcripts Claude Code keeps in `~/.claude/projects/`, cross-references cost and token data from [ccusage](https://github.com/ryoppippi/ccusage), and lists everything in one place: first prompt, project, message count, tokens, cost, models used, and last activity. Click a session to resume it in your terminal of choice (Ghostty, iTerm2, or Terminal.app) or open the project in VS Code with the resume command copied to your clipboard.

## Requirements

- macOS (terminal launching uses `open` and AppleScript)
- Node.js 18+
- Claude Code with existing sessions
- [ccusage](https://github.com/ryoppippi/ccusage) on PATH for the cost and token columns (optional; the list works without it)

## Getting started

```bash
git clone https://github.com/Sahilll15/claude-console.git
cd claude-console
node server.mjs
```

Open http://127.0.0.1:5959 in your browser. The server binds to localhost only, so nothing is exposed to your network.

The first scan reads every transcript and takes a few seconds, roughly 8 seconds for ~400 sessions. After that the index is cached and responses are instant. New sessions created while the server is running will not appear until you hit the rescan button.

## How to use

### Reading the list

Each row is one session. The main line is the first prompt you typed in that session, and below it are the project name, working directory, git branch, and a short session id chip. The columns to the right show message count, total tokens, cost, the models used (color dot per model family), and time since last activity.

The green bar under each cost value is a relative meter scaled against the most expensive session currently listed, so costly sessions stand out at a glance.

Under the default "recent first" sort, rows are grouped by day: today, yesterday, this week, this month, earlier.

### Finding a session

- Type in the search box to filter by prompt text, project name, or session id.
- Use the project dropdown to narrow the list to one project.
- Sort by recency, highest cost, most messages, or most tokens.
- "Hide noise" (on by default) hides empty sessions and internal memory-agent sessions. Untick it to see everything.
- Filters sync to the URL, so a filtered view survives reload and can be bookmarked.

### Resuming a session

- The first play button opens your selected terminal app in the session's working directory running `claude --resume <session-id>`.
- The "code" button opens the project folder in VS Code and copies the resume command to your clipboard. VS Code cannot start a resumed CLI session natively, so paste the command into its integrated terminal.
- The terminal dropdown in the toolbar controls which app the play button uses. It detects installed apps (Ghostty, iTerm2, Terminal.app), defaults to Ghostty when present, and remembers your choice.

### Keyboard shortcuts

- `/` focuses the search box
- `Escape` clears the search

### Copying a session id

Click the short id chip on any row to copy the full session id, useful for `claude --resume <id>` anywhere else.

## Troubleshooting

- Cost and token columns show `-`: ccusage is not installed or not on PATH. Install it with `npm i -g ccusage`.
- A session shows "(empty session)": the transcript has no user prompt, usually an aborted or tool-only session. These are hidden by "hide noise".
- Terminal opens but `claude` is not found: the server resolves the claude binary once at startup with `whence -p claude`. Restart the server after installing or moving Claude Code.
- Port 5959 is taken: edit the `PORT` constant at the top of `server.mjs`.

## Start on login (optional)

To keep the console always available, run it as a launchd agent. Save this as `~/Library/LaunchAgents/com.claude-console.plist` (adjust the paths to your clone and Node install), then run `launchctl load ~/Library/LaunchAgents/com.claude-console.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.claude-console</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/claude-console/server.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

## How it works

`server.mjs` is a dependency-free Node HTTP server. On the first request to `/api/sessions` it walks `~/.claude/projects/*/*.jsonl`, streaming each transcript line by line to pull out the working directory, git branch, first real user prompt, and message count, then merges in per-session cost and token totals from `ccusage session --json`. `POST /api/open` validates the session id against the index and launches the requested app: Terminal.app and iTerm2 through AppleScript, Ghostty through `open -na Ghostty.app --args --working-directory=... --command=...`. The frontend is a single `index.html` with no build step.
