#!/usr/bin/env node
// scripts/smoke-test.mjs
// Simply Service platform smoke test — Node.js built-ins only

import { execSync } from 'node:child_process';
import http from 'node:http';

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const X = '\x1b[0m';

const results = [];

function pass(name) {
  console.log(`${G}  PASS${X}  ${name}`);
  results.push({ name, ok: true });
}

function fail(name, reason) {
  console.log(`${R}  FAIL${X}  ${name}${reason ? ` — ${reason}` : ''}`);
  results.push({ name, ok: false });
}

function info(msg) {
  console.log(`${Y}  INFO${X}  ${msg}`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function httpGet(url) {
  const u = new URL(url);
  return httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET' });
}

function httpPost(url, payload) {
  const u = new URL(url);
  const body = JSON.stringify(payload);
  return httpRequest(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    body
  );
}

function httpGetAuth(url, token) {
  const u = new URL(url);
  return httpRequest({
    hostname: u.hostname,
    port: u.port,
    path: u.pathname + u.search,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function httpPostAuth(url, payload, token) {
  const u = new URL(url);
  const body = JSON.stringify(payload);
  return httpRequest(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    },
    body
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Checks ───────────────────────────────────────────────────────────────────

// 1. Redis ping
function checkRedisPing() {
  const name = 'Redis ping';
  try {
    const out = execSync('redis-cli -h localhost -p 6379 ping', { timeout: 5000 }).toString().trim();
    if (out === 'PONG') pass(name);
    else fail(name, `expected PONG, got: ${out}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 2. Postgres user count
function checkPostgresUsers() {
  const name = 'Postgres users';
  try {
    const out = execSync(
      `docker exec ss_postgres psql -U simply_user -d simply_service_db -t -A -c "select count(*) from users;"`,
      { timeout: 10000 }
    ).toString().trim();
    const count = parseInt(out, 10);
    if (!Number.isNaN(count) && count >= 13) pass(name);
    else fail(name, `expected >= 13 users, got: ${out}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 3. API health
async function checkApiHealth() {
  const name = 'API health';
  try {
    const res = await httpGet('http://localhost:4000/health');
    if (res.status !== 200) { fail(name, `HTTP ${res.status}`); return; }
    const json = JSON.parse(res.body);
    if (json.status === 'ok') pass(name);
    else fail(name, `unexpected body: ${res.body.slice(0, 120)}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 4. Web root
async function checkWebRoot() {
  const name = 'Web root';
  try {
    const res = await httpGet('http://localhost:3000/');
    if (res.status !== 200) { fail(name, `HTTP ${res.status}`); return; }
    const ct = res.headers['content-type'] || '';
    if (ct.includes('text/html')) pass(name);
    else fail(name, `Content-Type was: ${ct}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 5. Web /map route
async function checkWebMap() {
  const name = 'Web /map route';
  try {
    const res = await httpGet('http://localhost:3000/map');
    if (res.status === 200) pass(name);
    else fail(name, `HTTP ${res.status}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 6. Web health endpoint
async function checkWebHealth() {
  const name = 'Web health endpoint';
  try {
    const res = await httpGet('http://localhost:3000/health');
    if (res.status !== 200) { fail(name, `HTTP ${res.status}`); return; }
    let json;
    try { json = JSON.parse(res.body); } catch { fail(name, `non-JSON body: ${res.body.slice(0, 80)}`); return; }
    if (json.status === 'ok') pass(name);
    else fail(name, `unexpected body: ${res.body.slice(0, 120)}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 7. Role login checks — returns ownerToken
const ACCOUNTS = [
  { email: 'owner@simplyservice.dev',       role: 'OWNER' },
  { email: 'manager@simplyservice.dev',     role: 'MANAGER' },
  { email: 'tenant1@simplyservice.dev',     role: 'TENANT' },
  { email: 'tenant2@simplyservice.dev',     role: 'TENANT' },
  { email: 'contractor1@simplyservice.dev', role: 'CONTRACTOR' },
  { email: 'contractor2@simplyservice.dev', role: 'CONTRACTOR' },
  { email: 'admin@simplyservice.dev',       role: 'ADMIN' },
  { email: 'vendor@simplyservice.dev',      role: 'VENDOR' },
  { email: 'utility@simplyservice.dev',     role: 'UTILITY_PROVIDER' },
  { email: 'insurance@simplyservice.dev',   role: 'INSURANCE_PARTNER' },
  { email: 'finance@simplyservice.dev',     role: 'FINANCIAL_INSTITUTION' },
  { email: 'enterprise@simplyservice.dev',  role: 'ENTERPRISE' },
  { email: 'municipal@simplyservice.dev',   role: 'MUNICIPAL_PARTNER' },
];

async function checkRoleLogins() {
  let ownerToken = null;
  for (const acct of ACCOUNTS) {
    const name = `Login ${acct.email}`;
    try {
      const res = await httpPost('http://localhost:4000/api/v1/auth/login', {
        email: acct.email,
        password: 'Password123!',
      });
      let json;
      try { json = JSON.parse(res.body); } catch { fail(name, `non-JSON: ${res.body.slice(0, 80)}`); continue; }

      const statusOk = json.status === 'success';
      const role = json?.data?.user?.role || json?.user?.role || json?.data?.role || json?.role || null;
      const roleOk = role === acct.role;

      if (statusOk && roleOk) {
        pass(name);
        if (acct.email === 'owner@simplyservice.dev') {
          ownerToken = json?.data?.accessToken || json?.data?.token || json?.accessToken || null;
        }
      } else {
        fail(name, !statusOk ? `status=${json.status}` : `role expected=${acct.role} got=${role}`);
      }
    } catch (e) {
      fail(name, e.message);
    }
  }
  return ownerToken;
}

// 8. Map data
async function checkMapData(ownerToken) {
  const name = 'Map data (properties with coords)';
  if (!ownerToken) { fail(name, 'no owner token available'); return; }
  try {
    const res = await httpGetAuth('http://localhost:4000/api/v1/properties?limit=10', ownerToken);
    if (res.status !== 200) { fail(name, `HTTP ${res.status}`); return; }
    let json;
    try { json = JSON.parse(res.body); } catch { fail(name, `non-JSON: ${res.body.slice(0, 80)}`); return; }

    const list = json?.data?.properties || json?.properties || (Array.isArray(json) ? json : null);
    if (!Array.isArray(list)) { fail(name, `unexpected shape: ${res.body.slice(0, 120)}`); return; }
    if (list.length < 4) { fail(name, `expected >= 4 properties, got ${list.length}`); return; }

    const geoCount = list.filter((p) => p.latitude != null && p.longitude != null).length;
    if (geoCount >= 4) pass(name);
    else fail(name, `only ${geoCount}/4+ properties have lat/lng`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 9. AI chat endpoint
async function checkAiChat(ownerToken) {
  const name = 'AI chat endpoint';
  if (!ownerToken) { fail(name, 'no owner token available'); return; }
  try {
    const res = await httpPostAuth(
      'http://localhost:4000/api/v1/ai/chat',
      { message: 'Walk me through creating a work order' },
      ownerToken
    );
    if (res.status !== 200) { fail(name, `HTTP ${res.status} — ${res.body.slice(0, 120)}`); return; }
    let json;
    try { json = JSON.parse(res.body); } catch { fail(name, `non-JSON: ${res.body.slice(0, 80)}`); return; }
    if (json.status === 'success') pass(name);
    else fail(name, `unexpected body: ${res.body.slice(0, 120)}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// 10. Persistence check
function getDbUserCount() {
  const out = execSync(
    `docker exec ss_postgres psql -U simply_user -d simply_service_db -t -A -c "select count(*) from users;"`,
    { timeout: 10000 }
  ).toString().trim();
  return parseInt(out, 10);
}

async function checkPersistence() {
  const name = 'Persistence after DB restart';
  try {
    const before = getDbUserCount();
    info(`User count before restart: ${before}`);
    execSync('docker restart ss_postgres', { timeout: 30000 });

    let after = NaN;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await sleep(2000);
      try { after = getDbUserCount(); break; } catch { /* still coming up */ }
    }

    if (Number.isNaN(after)) { fail(name, 'postgres did not recover within 30 s'); return; }
    info(`User count after restart: ${after}`);
    if (after === before) pass(name);
    else fail(name, `count changed: ${before} → ${after}`);
  } catch (e) {
    fail(name, e.message);
  }
}

// ─── Summary table ────────────────────────────────────────────────────────────

function printSummary() {
  const W = 41;
  const top    = `╔${'═'.repeat(W + 2)}╦════════╗`;
  const header = `║ ${'Check'.padEnd(W)} ║ Result ║`;
  const mid    = `╠${'═'.repeat(W + 2)}╬════════╣`;
  const bottom = `╚${'═'.repeat(W + 2)}╩════════╝`;

  console.log('\n' + top);
  console.log(header);
  console.log(mid);
  for (const r of results) {
    const label = r.name.slice(0, W).padEnd(W);
    const mark = r.ok ? `${G}  PASS  ${X}` : `${R}  FAIL  ${X}`;
    console.log(`║ ${label} ║${mark}║`);
  }
  console.log(bottom);

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const color = passed === total ? G : R;
  console.log(`\n${color}Total: ${passed}/${total} passed${X}\n`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${Y}═══ Simply Service Smoke Tests ═══${X}\n`);

  checkRedisPing();
  checkPostgresUsers();
  await checkApiHealth();
  await checkWebRoot();
  await checkWebMap();
  await checkWebHealth();
  const ownerToken = await checkRoleLogins();
  await checkMapData(ownerToken);
  await checkAiChat(ownerToken);
  await checkPersistence();

  printSummary();

  const anyFail = results.some((r) => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(`${R}Unhandled error:${X}`, e);
  process.exit(1);
});
