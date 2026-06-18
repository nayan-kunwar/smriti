#!/usr/bin/env node
/**
 * E2E smoke: create user → create memory → poll until active → retrieve context.
 * Requires API + workers + infra running locally.
 *
 * Usage: node scripts/e2e-smoke.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }
  return body;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const user = await request('/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Smoke User' }),
  });

  const userId = user.user.id;
  const headers = {
    'content-type': 'application/json',
    'x-user-id': userId,
  };

  const created = await request('/memories', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'semantic',
      content: 'I build backend systems with TypeScript and PostgreSQL.',
    }),
  });

  const memoryId = created.memory.id;
  let active = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await request(`/users/${userId}/memories`, { headers });
    const memory = list.items.find((item) => item.id === memoryId);
    if (memory?.status === 'active') {
      active = true;
      break;
    }
    await sleep(1000);
  }

  if (!active) {
    throw new Error('memory did not become active within timeout');
  }

  const context = await request('/memories/context', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'What technologies does the user use?' }),
  });

  if (!context.context?.length) {
    throw new Error('retrieval returned empty context');
  }

  console.log(JSON.stringify({ ok: true, userId, memoryId, contextItems: context.items.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
