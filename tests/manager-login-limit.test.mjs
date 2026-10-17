import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createLoginLimiter } from '../app/api/manager/_login-limit.ts';

const minute = 60 * 1000;
const start = Date.UTC(2026, 9, 17, 9, 0, 0);

test('five failures block that IP and login ID for 15 minutes', () => {
  const limiter = createLoginLimiter();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limiter.isBlocked('203.0.113.1', 'admin', start), false);
    limiter.recordFailure('203.0.113.1', 'admin', start);
  }
  assert.equal(limiter.isBlocked('203.0.113.1', 'admin', start + minute), true);
  assert.equal(limiter.isBlocked('203.0.113.1', 'ADMIN ', start + minute), true);
  assert.equal(limiter.isBlocked('203.0.113.1', 'admin', start + 15 * minute + 1), false);
});

test('a block for one IP never locks the same ID elsewhere or other IDs on that IP', () => {
  const limiter = createLoginLimiter();
  for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure('203.0.113.1', 'admin', start);
  assert.equal(limiter.isBlocked('198.51.100.9', 'admin', start), false);
  assert.equal(limiter.isBlocked('203.0.113.1', 'staff1', start), false);
});

test('a successful login clears that IP and ID', () => {
  const limiter = createLoginLimiter();
  for (let attempt = 0; attempt < 4; attempt += 1) limiter.recordFailure('203.0.113.1', 'admin', start);
  limiter.recordSuccess('203.0.113.1', 'admin');
  limiter.recordFailure('203.0.113.1', 'admin', start);
  assert.equal(limiter.isBlocked('203.0.113.1', 'admin', start), false);
});

test('thirty failures from one IP across many IDs block that IP', () => {
  const limiter = createLoginLimiter();
  for (let attempt = 0; attempt < 30; attempt += 1) limiter.recordFailure('203.0.113.1', `guess-${attempt}`, start);
  assert.equal(limiter.isBlocked('203.0.113.1', 'brand-new-id', start), true);
  assert.equal(limiter.isBlocked('198.51.100.9', 'brand-new-id', start), false);
});

test('client IP comes from the proxy headers', () => {
  const request = (headers) => new Request('http://localhost/api/manager/auth', { headers });
  assert.equal(clientIp(request({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' })), '203.0.113.1');
  assert.equal(clientIp(request({ 'x-real-ip': '198.51.100.9' })), '198.51.100.9');
  assert.equal(clientIp(request({})), 'unknown');
});
