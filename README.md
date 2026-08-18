# claude-console

A local web dashboard for browsing and resuming your Claude Code sessions.

```bash
npx claude-console
```

![Clicking a session's resume button, which reopens it in the terminal](https://raw.githubusercontent.com/Sahilll15/claude-console/main/docs/resume.gif)

Claude Code keeps every session as a transcript on disk, but gives you no way to look
back through them. This reads those transcripts and puts them in one list: the prompt
you opened with, the project, the branch, how many messages, how many tokens, what it
cost, and which models ran. Click a row and the session reopens in your terminal,
already resumed.

Everything runs on your machine. The server binds to `127.0.0.1`, has no dependencies,
and sends nothing anywhere.

> Screenshots use a generated demo session set, not real data.

## Requirements

- macOS (opening a terminal uses `open` and AppleScript)
- Node.js 18 or newer
- Claude Code, with at least one session in `~/.claude/projects/`
- [ccusage](https://github.com/ryoppippi/ccusage) on your PATH for the cost and token
  columns. Optional: without it the list still works and those columns show `-`.

## Run it

```bash
npx claude-console
```

Then open http://127.0.0.1:5959. Use a different port with `--port 6060` or
`PORT=6060`.

To run it from a clone instead:

```bash
git clone https://github.com/Sahilll15/claude-console.git
cd claude-console
node server.mjs
```

The first scan reads every transcript, roughly 8 seconds for 400 sessions. After that
the index is cached and the list is instant. Sessions created while the server is
running appear when you hit `rescan`.

## What you can do

### Read the list

![The claude-console dashboard listing sessions grouped by day](https://raw.githubusercontent.com/Sahilll15/claude-console/main/docs/dashboard.png)

Each row starts with the first prompt you typed, so you can recognise a session by what
you were trying to do. Under it are the project, working directory, git branch, and a
short session id. To the right: message count, tokens, cost, the models used as a
coloured dot per family, and time since the last activity.

The green bar under each cost is scaled against the most expensive session on screen, so
the costly ones stand out without reading any numbers. Under the default sort, rows are
grouped into today, yesterday, this week, this month, and earlier.

### Find one

![Searching for test and sorting by highest cost](https://raw.githubusercontent.com/Sahilll15/claude-console/main/docs/search.png)

- Type in the search box to filter by prompt, project, or session id.
- Narrow to a single project with the dropdown.
- Sort by recency, cost, messages, or tokens.
- `hide noise` is on by default and drops empty and internal sessions. Untick it to see
  everything.
- Press `/` to jump to the search box, `Escape` to clear it.

Filters are written to the URL, so a view you like survives a reload and can be
bookmarked.

### Resume one

- The terminal button opens your terminal in the session's directory running
  `claude --resume <id>`. The toolbar dropdown picks which app it uses: it detects
  Ghostty, iTerm2, and Terminal.app, and remembers your choice.
- The `code` button opens the project in VS Code and copies the resume command to your
  clipboard. VS Code cannot start a resumed CLI session itself, so paste it into the
  integrated terminal.
- Click the short id chip on any row to copy the full session id.

## How it works

`server.mjs` is a single dependency-free Node HTTP server. On the first request to
`/api/sessions` it walks `~/.claude/projects/*/*.jsonl`, streams each transcript line by
line to pull out the working directory, branch, first real user prompt, and message
count, then merges in per-session cost and tokens from `ccusage session --json`.

`POST /api/open` validates the session id against that index before launching anything,
then opens Terminal.app and iTerm2 through AppleScript, and Ghostty through
`open -na Ghostty.app`.

The frontend is one `index.html` with no build step.

To read a different config directory, set `CLAUDE_CONFIG_DIR`:

```bash
CLAUDE_CONFIG_DIR=~/some-other-claude-dir npx claude-console
```

## Troubleshooting

| What you see | Why |
| --- | --- |
| Cost and tokens show `-` | ccusage is not on PATH. Install it with `npm i -g ccusage`. |
| A row says `(empty session)` | The transcript has no user prompt, usually an aborted or tool-only run. `hide noise` hides these. |
| Terminal opens but `claude` is not found | The binary is resolved once at startup. Restart the server after installing or moving Claude Code. |
| `Port 5959 is in use` | Start it on another port with `--port 6060`. |

<details>
<summary>Start it on login</summary>

Save this as `~/Library/LaunchAgents/com.claude-console.plist`, correcting the two paths
for your clone and your Node install, then run
`launchctl load ~/Library/LaunchAgents/com.claude-console.plist`.

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

</details>

## License

MIT
