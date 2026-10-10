const test = require('node:test');
const assert = require('node:assert/strict');
const { KeyedMutex, mapLimit, TtlDedup, RateLimiter } = require('../src/whatsappAutomation/concurrency');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('KeyedMutex serialises the same key and parallelises different keys', async () => {
  const mutex = new KeyedMutex();
  const order = [];
  let active = 0;
  let maxActiveSameKey = 0;
  const job = (key, id) => mutex.run(key, async () => {
    if (key === 'a') { active += 1; maxActiveSameKey = Math.max(maxActiveSameKey, active); }
    order.push(`${key}${id}:start`);
    await sleep(10);
    order.push(`${key}${id}:end`);
    if (key === 'a') active -= 1;
  });
  await Promise.all([job('a', 1), job('a', 2), job('a', 3), job('b', 1)]);
  assert.equal(maxActiveSameKey, 1);
  const aOrder = order.filter((e) => e.startsWith('a')).join(',');
  assert.equal(aOrder, 'a1:start,a1:end,a2:start,a2:end,a3:start,a3:end');
  assert.ok(order.indexOf('b1:start') < order.indexOf('a1:end'), 'different key must not wait');
  assert.equal(mutex.size, 0, 'no leaked keys');
});

test('KeyedMutex releases the lock when a job throws', async () => {
  const mutex = new KeyedMutex();
  await assert.rejects(mutex.run('k', async () => { throw new Error('boom'); }));
  assert.equal(await mutex.run('k', async () => 'ok'), 'ok');
});

test('mapLimit respects the concurrency limit and isolates failures', async () => {
  let active = 0; let peak = 0;
  const results = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    active += 1; peak = Math.max(peak, active);
    await sleep(5);
    active -= 1;
    if (n === 4) throw new Error('x');
    return n;
  });
  assert.equal(peak, 3);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 7);
});

test('TtlDedup drops repeats until expiry', () => {
  const d = new TtlDedup({ ttlMs: 100 });
  assert.equal(d.seen('m1', 0), false);
  assert.equal(d.seen('m1', 50), true);
  assert.equal(d.seen('m1', 150), false);
  assert.equal(d.seen(undefined), false);
});

test('RateLimiter enforces a window limit', () => {
  const r = new RateLimiter({ limit: 2, windowMs: 100 });
  assert.equal(r.allow('x', 0), true);
  assert.equal(r.allow('x', 1), true);
  assert.equal(r.allow('x', 2), false);
  assert.equal(r.allow('y', 2), true);
  assert.equal(r.allow('x', 200), true);
});
