'use strict';

// Next's dev server (with or without Turbopack) compiles each route lazily, the first time
// something actually requests it -- that's why the *first* click on a sidebar link (or the
// first login, which immediately fires off a dozen API calls) pays a multi-second compile
// tax that every visit after it doesn't. This wrapper starts `next dev` exactly as before,
// then -- as soon as the server reports it's actually ready -- fires one GET at every real
// page route and every API route AppContext hits on login, in parallel, so Next compiles
// all of them up front. By the time a person actually clicks around, it's all warm.
const path = require('path');
const { spawn } = require('child_process');

const PAGE_ROUTES = [
  '/',
  '/dashboard',
  '/firms',
  '/documents',
  '/bids',
  '/saved-bids',
  '/bid-docs',
  '/templates',
  '/sheets',
  '/direct-link',
  '/search',
  '/expiry',
  '/categories',
  '/departments',
  '/tags',
  '/statuses',
  '/firm-types',
  '/bid-categories',
  '/item-categories',
  '/clients',
  '/users',
  '/roles',
  '/approvals',
  '/audit',
  '/reports',
  '/notifications',
  '/settings',
  '/profile',
  '/google-drive',
  '/privacy-policy',
  '/terms-of-service',
];

// The endpoints AppContext.fetchData() hits in one burst right after login -- warming these
// too means that burst doesn't double as everyone's first-ever compile of each of them.
const API_ROUTES = [
  '/api/users/login',
  '/api/firms',
  '/api/master',
  '/api/documents',
  '/api/users',
  '/api/notifications',
  '/api/audit-logs',
  '/api/templates',
  '/api/bids',
];

const ROUTES = [...PAGE_ROUTES, ...API_ROUTES];
const CONCURRENCY = 4;

const isWin = process.platform === 'win32';
const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', isWin ? 'next.cmd' : 'next');

// .cmd shims (next.cmd) aren't directly executable on Windows -- they need a shell to
// interpret them. Passing `shell: true` together with an argv array makes Node warn
// (DEP0190) because it can no longer guarantee escaping -- since everything here is a
// fixed, hardcoded string (never user input), building the one-line command ourselves and
// handing shell:true a single string instead sidesteps that safely. Not needed on POSIX,
// where `next` is the real executable and no shell is involved.
const child = isWin
  ? spawn(`"${nextBin}" dev --turbopack`, { stdio: ['inherit', 'pipe', 'inherit'], shell: true })
  : spawn(nextBin, ['dev', '--turbopack'], { stdio: ['inherit', 'pipe', 'inherit'] });

let warmupStarted = false;
let buffer = '';

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  // Once the port + "Ready" line have been found there's nothing left to scan for, so
  // stop accumulating entirely -- growing (and truncating) the buffer forever was risking
  // slicing the port/Ready text away before the match ever succeeded, if Next's startup
  // banner happened to be long enough.
  if (warmupStarted) return;

  buffer += text;
  const portMatch = buffer.match(/http:\/\/localhost:(\d+)/);
  if (portMatch && /Ready in/i.test(buffer)) {
    warmupStarted = true;
    runWarmup(Number(portMatch[1]));
  }
});

async function runWarmup(port) {
  const base = `http://localhost:${port}`;
  console.log(`\n[warmup] Pre-compiling ${ROUTES.length} routes so first visits are instant...`);
  const start = Date.now();
  const queue = [...ROUTES];
  let ok = 0;
  const failed = [];

  async function worker() {
    while (queue.length) {
      const route = queue.shift();
      try {
        const res = await fetch(base + route, { redirect: 'manual' });
        // Any response at all -- including a 401 from an auth-gated API route, or a 405
        // from a GET against a POST-only route -- means Next successfully compiled and ran
        // the route; that's all warmup is trying to achieve. Only a 5xx (the route itself
        // erroring out while handling the request) counts as a real warmup failure.
        if (res.status >= 500) failed.push(`${route} (HTTP ${res.status})`);
        else ok++;
      } catch (err) {
        failed.push(`${route} (${err.message})`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[warmup] Done -- ${ok}/${ROUTES.length} routes compiled in ${seconds}s` + (failed.length ? `, ${failed.length} failed` : '') + '\n');
  if (failed.length) console.log('[warmup] Failed routes:\n  ' + failed.join('\n  ') + '\n');
}

child.on('exit', (code) => process.exit(code ?? 0));

// child.kill() on POSIX delivers a real SIGINT/SIGTERM straight to `next`. On Windows,
// `next.cmd` was spawned through a `shell: true` cmd.exe intermediary (see above) --
// Windows has no real POSIX signals, and killing just that intermediary can leave the
// actual `next dev` process (and the port it's holding) running behind it. `taskkill /T`
// kills the whole process tree instead, so the port is reliably freed on Ctrl+C.
function shutdown(signal) {
  if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill(signal);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
