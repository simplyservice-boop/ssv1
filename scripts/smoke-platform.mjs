#!/usr/bin/env node

import { execSync } from 'node:child_process';

const API_BASE = process.env.SMOKE_API_BASE || 'http://localhost:4000/api/v1';
const WEB_BASE = process.env.SMOKE_WEB_BASE || 'http://localhost:3000';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Password123!';

const roleEmails = [
  'owner@simplyservice.dev',
  'manager@simplyservice.dev',
  'tenant1@simplyservice.dev',
  'tenant2@simplyservice.dev',
  'contractor1@simplyservice.dev',
  'contractor2@simplyservice.dev',
  'admin@simplyservice.dev',
  'vendor@simplyservice.dev',
  'utility@simplyservice.dev',
  'insurance@simplyservice.dev',
  'finance@simplyservice.dev',
  'enterprise@simplyservice.dev',
  'municipal@simplyservice.dev',
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, text, data };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function checkHealth() {
  section('Health Checks');
  const api = await jsonFetch('http://localhost:4000/health');
  if (!api.res.ok || api.data?.status !== 'ok') fail('API health failed');
  console.log('API health: OK');

  const web = await fetch(`${WEB_BASE}/`, { method: 'HEAD' });
  if (!web.ok) fail('Web root is not reachable');
  console.log('Web root: OK');

  const map = await fetch(`${WEB_BASE}/map`, { method: 'HEAD' });
  if (!map.ok) fail('Web map route is not reachable');
  console.log('Web /map: OK');

  const redisPing = execSync('redis-cli -h localhost -p 6379 ping', { encoding: 'utf8' }).trim();
  if (redisPing !== 'PONG') fail(`Redis ping failed: ${redisPing}`);
  console.log('Redis ping: OK');
}

async function login(email) {
  const result = await jsonFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!result.res.ok) fail(`Login failed for ${email} (HTTP ${result.res.status})`);
  if (result.data?.status !== 'success') fail(`Login status invalid for ${email}`);
  return result.data?.data;
}

async function checkRoleMatrix() {
  section('Role Login Matrix');
  for (const email of roleEmails) {
    const auth = await login(email);
    console.log(`${email} -> ${auth?.user?.role || 'UNKNOWN'}`);
  }
}

async function checkAiAndMap(ownerToken) {
  section('AI + Map Data');
  const ai = await jsonFetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ message: 'Walk me through creating a work order for a plumbing leak.' }),
  });
  if (!ai.res.ok || ai.data?.status !== 'success') fail('AI chat endpoint failed');
  const preview = String(ai.data?.data?.response || '').slice(0, 140).replace(/\s+/g, ' ');
  console.log(`AI chat: OK -> ${preview}`);

  const props = await jsonFetch(`${API_BASE}/properties?limit=20`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (!props.res.ok || props.data?.status !== 'success') fail('Properties endpoint failed');
  const properties = props.data?.data?.properties || [];
  const withCoords = properties.filter((p) => p.latitude != null && p.longitude != null).length;
  if (withCoords === 0) fail('No properties with coordinates found for map');
  console.log(`Map data: OK -> ${withCoords}/${properties.length} properties have coordinates`);
}

function sqlUserCount() {
  return execSync("docker exec ss_postgres psql -U simply_user -d simply_service_db -t -A -c \"select count(*) from users;\"", { encoding: 'utf8' }).trim();
}

function waitForPostgresReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const ready = execSync('docker exec ss_postgres pg_isready -U simply_user -d simply_service_db', { encoding: 'utf8' });
      if (ready.includes('accepting connections')) return;
    } catch {
      // Keep retrying
    }
  }
  fail('Postgres did not become ready after restart');
}

function checkPersistence() {
  section('Persistence Check');
  const before = sqlUserCount();
  execSync('docker restart ss_postgres', { stdio: 'ignore' });
  waitForPostgresReady();
  const after = sqlUserCount();
  if (before !== after) fail(`Persistence mismatch: before=${before}, after=${after}`);
  console.log(`Persistence: OK -> users before=${before}, after=${after}`);
}

async function main() {
  await checkHealth();
  await checkRoleMatrix();
  const owner = await login('owner@simplyservice.dev');
  const token = owner?.accessToken;
  if (!token) fail('Owner access token missing');
  await checkAiAndMap(token);
  checkPersistence();
  section('Summary');
  console.log('PASS: Platform smoke checks completed successfully.');
}

main().catch((err) => fail(err?.message || String(err)));