#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argPortIdx = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT || (argPortIdx > -1 ? process.argv[argPortIdx + 1] : 0)) || 5959;
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CONFIG_DIR, 'projects');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sessionIndex = new Map();
let indexBuiltAt = 0;

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

async function getCcusageBySession() {
  const map = new Map();
  try {
    const out = await execFileP('ccusage', ['session', '--json']);
    const data = JSON.parse(out);
    for (const s of data.session || []) {
      map.set(s.period, {
        cost: s.totalCost,
        tokens: s.totalTokens,
        models: s.modelsUsed,
        lastActivity: s.metadata?.lastActivity,
      });
    }
  } catch {
    // ccusage missing/failed: cost + token columns just render as unknown
  }
  return map;
}

function extractPromptText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const t = block.text.trim();
        if (t) return t;
      }
    }
  }
  return '';
}

async function scanSessionFile(projectDir, fileName) {
  const sessionId = fileName.replace(/\.jsonl$/, '');
  const filePath = path.join(projectDir, fileName);
  const stat = await fsp.stat(filePath);

  let cwd = null;
  let prompt = null;
  let messageCount = 0;
  let lastTimestamp = null;
  let gitBranch = null;

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.cwd && !cwd) cwd = rec.cwd;
    if (rec.gitBranch && !gitBranch) gitBranch = rec.gitBranch;
    if (rec.timestamp) lastTimestamp = rec.timestamp;

    if ((rec.type === 'user' || rec.type === 'assistant') && !rec.isMeta) {
      messageCount++;
      // First real (non-tag, non-tool-result) user message becomes the prompt preview
      if (!prompt && rec.type === 'user') {
        const text = extractPromptText(rec.message?.content);
        if (text && !text.startsWith('<')) prompt = text;
      }
    }
  }

  return {
    sessionId,
    cwd: cwd || projectDir,
    projectName: cwd ? path.basename(cwd) : path.basename(projectDir),
    prompt: prompt || '(no prompt captured)',
    messageCount,
    gitBranch,
    lastActivity: lastTimestamp || stat.mtime.toISOString(),
    sizeBytes: stat.size,
  };
}

async function buildIndex() {
  const ccusageMap = await getCcusageBySession();
  const projectDirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
  const tasks = [];

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(PROJECTS_DIR, entry.name);
    let files;
    try {
      files = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.isFile() && f.name.endsWith('.jsonl')) tasks.push(scanSessionFile(dirPath, f.name));
    }
  }

  const sessions = await Promise.all(tasks);
  const merged = sessions.map((s) => {
    const usage = ccusageMap.get(s.sessionId);
    return {
      ...s,
      cost: usage?.cost ?? null,
      tokens: usage?.tokens ?? null,
      models: usage?.models ?? [],
      lastActivity: usage?.lastActivity || s.lastActivity,
    };
  });

  merged.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  sessionIndex = new Map(merged.map((s) => [s.sessionId, s]));
  indexBuiltAt = Date.now();
  return merged;
}

function quoteAppleScript(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

const TERMINAL_APPS = [
  { id: 'ghostty', label: 'Ghostty', appPath: '/Applications/Ghostty.app' },
  { id: 'iterm', label: 'iTerm2', appPath: '/Applications/iTerm.app' },
  { id: 'terminal', label: 'Terminal', appPath: '/System/Applications/Utilities/Terminal.app' },
];
const availableTerminals = TERMINAL_APPS.filter((t) => fs.existsSync(t.appPath));

let claudeBin = 'claude';
execFile('/bin/zsh', ['-c', 'whence -p claude'], (err, stdout) => {
  if (!err && stdout.trim()) claudeBin = stdout.trim();
});

async function openInGhostty(session) {
  // Bare paths in --args (e.g. "-e /bin/zsh") become macOS file-open events and
  // trigger Ghostty's "open /bin/zsh?" dialog; --key=value args do not.
  await execFileP('open', [
    '-na', 'Ghostty.app', '--args',
    `--working-directory=${session.cwd}`,
    `--command=${claudeBin} --resume ${session.sessionId}`,
  ]);
}

async function openInITerm(session) {
  const shellCmd = `cd ${JSON.stringify(session.cwd)} && claude --resume ${session.sessionId}`;
  const script = `tell application "iTerm"\n  activate\n  create window with default profile command ${quoteAppleScript('/bin/zsh -ic ' + JSON.stringify(shellCmd))}\nend tell`;
  await execFileP('osascript', ['-e', script]);
}

async function openInTerminal(session) {
  const shellCmd = `cd ${JSON.stringify(session.cwd)} && claude --resume ${session.sessionId}`;
  const script = `tell application "Terminal"\n  activate\n  do script ${quoteAppleScript(shellCmd)}\nend tell`;
  await execFileP('osascript', ['-e', script]);
}

const TERMINAL_OPENERS = { ghostty: openInGhostty, iterm: openInITerm, terminal: openInTerminal };

async function openInVSCode(session) {
  await execFileP('code', [session.cwd]);
  try {
    await new Promise((resolve, reject) => {
      const child = execFile('pbcopy', (err) => (err ? reject(err) : resolve()));
      child.stdin.end(`claude --resume ${session.sessionId}`);
    });
  } catch {
    // clipboard copy is a convenience only; VS Code still opened either way
  }
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    // Without nosniff a browser may sniff a JSON body as HTML and render it.
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const html = await fsp.readFile(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    try {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const sessions = forceRefresh || sessionIndex.size === 0 ? await buildIndex() : [...sessionIndex.values()];
      sendJson(res, 200, { sessions, indexBuiltAt, terminals: availableTerminals.map(({ id, label }) => ({ id, label })) });
    } catch (err) {
      console.error('[sessions] scan failed:', err);
      sendJson(res, 500, { error: 'could not read sessions' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/open') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { sessionId, target, app } = JSON.parse(body);
        if (!UUID_RE.test(sessionId || '')) return sendJson(res, 400, { error: 'invalid sessionId' });
        const session = sessionIndex.get(sessionId);
        if (!session) return sendJson(res, 404, { error: 'unknown session' });

        if (target === 'terminal') {
          const termId = app || availableTerminals[0]?.id;
          const opener = availableTerminals.some((t) => t.id === termId) && TERMINAL_OPENERS[termId];
          if (!opener) {
            console.error(`[open] unavailable terminal requested: ${termId}`);
            return sendJson(res, 400, { error: 'terminal app not available' });
          }
          await opener(session);
        } else if (target === 'vscode') await openInVSCode(session);
        else return sendJson(res, 400, { error: 'invalid target' });
        console.log(`[open] ${target}${app ? ':' + app : ''} ${sessionId} cwd=${session.cwd}`);

        sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error('[open] failed:', err);
        sendJson(res, 500, { error: 'could not open the session' });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} is in use. Pick another with --port 6060 or PORT=6060.`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude session console running at http://127.0.0.1:${PORT}`);
});
