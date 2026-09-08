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
  buffer += text;
  // Keep the buffer small -- we only ever need the most recent output to see the port
  // and the "Ready" line.
  if (buffer.length > 5000) buffer = buffer.slice(-5000);

  if (!warmupStarted) {
    const portMatch = buffer.match(/http:\/\/localhost:(\d+)/);
    if (portMatch && /Ready in/i.test(buffer)) {
      warmupStarted = true;
      runWarmup(Number(portMatch[1]));
    }
  }
});

async function runWarmup(port) {
  const base = `http://localhost:${port}`;
  console.log(`\n[warmup] Pre-compiling ${ROUTES.length} routes so first visits are instant...`);
  const start = Date.now();
  const queue = [...ROUTES];
  let ok = 0;

  async function worker() {
    while (queue.length) {
      const route = queue.shift();
      try {
        await fetch(base + route, { redirect: 'manual' });
        ok++;
      } catch {
        // Best-effort -- a route failing to warm just means it'll compile on first real
        // visit like before, not a hard failure worth stopping the dev server over.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[warmup] Done -- ${ok}/${ROUTES.length} routes compiled in ${seconds}s\n`);
}

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
