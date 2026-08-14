# claude-console

A local web dashboard for browsing and resuming your Claude Code sessions.

It scans the session transcripts Claude Code keeps in `~/.claude/projects/`, cross-references cost and token data from [ccusage](https://github.com/ryoppippi/ccusage), and lists everything in one place: first prompt, project, message count, tokens, cost, models used, and last activity. Click a session to resume it in your terminal of choice (Ghostty, iTerm2, or Terminal.app) or open the project in VS Code with the resume command copied to your clipboard.

## Features

- Session list grouped by day, with search, project filter, and sorting by recency, cost, messages, or tokens
- Aggregate stats: total sessions, projects, tokens, and spend
- Relative cost meter per row so expensive sessions stand out
- One-click resume: opens the picked terminal app in the session's working directory running `claude --resume <id>`
- Terminal picker with persistence (defaults to Ghostty when installed)
- Copy a session id from its chip; `/` focuses search, Escape clears it
- Filter state syncs to the URL, so views are shareable and survive reload

## Requirements

- macOS (terminal launching uses `open` and AppleScript)
- Node.js 18+
- Claude Code with existing sessions
- [ccusage](https://github.com/ryoppippi/ccusage) on PATH for cost and token columns (optional; the list works without it)

## Run

```bash
node server.mjs
```

Then open http://127.0.0.1:5959. The server binds to localhost only.

The first scan reads every transcript and takes a few seconds; after that the index is cached. Use the rescan button to pick up new sessions.
