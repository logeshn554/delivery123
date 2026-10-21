import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import express from 'express';
import { trustProxySetting, rateLimitKey } from './clientIpPolicy.mjs';

test('proxy trust is a strict hop count and defaults to untrusted', () => {
  for (const unset of [undefined, null, '', '   ', '0']) assert.equal(trustProxySetting(unset), false);
  assert.equal(trustProxySetting('1'), 1);
  assert.equal(trustProxySetting(' 2 '), 2);
  assert.equal(trustProxySetting('5'), 5);
  // The supported configuration is a bounded hop count, never blanket trust or an address list.
  for (const bad of ['true', 'loopback', '10.0.0.0/8', '-1', '1.5', '6', '99', 'one']) assert.throws(() => trustProxySetting(bad), /ACCOUNT_TRUST_PROXY/);
});

test('rate-limit keys keep IPv4 addresses and fold IPv4-mapped IPv6 into them', () => {
  assert.equal(rateLimitKey('203.0.113.9'), '203.0.113.9');
  assert.equal(rateLimitKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(rateLimitKey('::ffff:cb00:7109'), '203.0.113.9');
});

test('rate-limit keys group IPv6 clients by /64 so rotating host bits does not evade limits', () => {
  const a = rateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
  assert.equal(a, 'v6:2001:0db8:0001:0002');
  assert.equal(rateLimitKey('2001:db8:1:2::1'), a);
  assert.equal(rateLimitKey('2001:DB8:1:2:ffff:ffff:ffff:ffff'), a);
  assert.equal(rateLimitKey('2001:db8:1:2:3:4:5:6%eth0'), a);
  assert.notEqual(rateLimitKey('2001:db8:1:3::1'), a);
  assert.equal(rateLimitKey('::1'), 'v6:0000:0000:0000:0000');
  assert.equal(rateLimitKey('2001:db8::'), 'v6:2001:0db8:0000:0000');
});

test('unusable addresses share one conservative bucket instead of throwing', () => {
  for (const value of [undefined, null, 42, '', '   ', 'not-an-ip', '999.1.1.1', '1:2:3:4:5:6:7:8:9', '203.0.113.9%eth0']) assert.equal(rateLimitKey(value), 'unknown');
});

function clientIps(proxySetting, headersList) {
  const app = express();
  app.set('trust proxy', proxySetting);
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      const get = headers => new Promise((done, fail) => http.get({ host: '127.0.0.1', port, headers }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => done(JSON.parse(body).ip));
      }).on('error', fail).setTimeout(3000, function () { this.destroy(new Error('Test HTTP request timed out.')); }));
      try { resolve(await Promise.all(headersList.map(get))); }
      catch (error) { reject(error); }
      finally { server.close(); }
    });
    server.on('error', reject);
  });
}

test('behind one trusted proxy each real client gets its own identity', async () => {
  const ips = await clientIps(trustProxySetting('1'), [
    { 'X-Forwarded-For': '198.51.100.10' }, { 'X-Forwarded-For': '203.0.113.77' }, { 'X-Forwarded-For': '192.0.2.5' },
  ]);
  assert.deepEqual(ips, ['198.51.100.10', '203.0.113.77', '192.0.2.5']);
});

test('a client cannot forge its identity by prepending to X-Forwarded-For', async () => {
  // The proxy appends the address it actually saw, so the forged leading entry is ignored.
  const [ip] = await clientIps(trustProxySetting('1'), [{ 'X-Forwarded-For': '1.1.1.1, 203.0.113.77' }]);
  assert.equal(ip, '203.0.113.77');
});

test('without a trusted proxy the forwarded header is ignored entirely', async () => {
  const ips = await clientIps(trustProxySetting(undefined), [{ 'X-Forwarded-For': '198.51.100.10' }, { 'X-Forwarded-For': '1.1.1.1' }]);
  assert.deepEqual(ips, ['127.0.0.1', '127.0.0.1']);
});

test('the account API applies the proxy setting and the normalized key to its auth limiter', () => {
  const source = readFileSync(new URL('./accounts.mjs', import.meta.url), 'utf8');
  assert.match(source, /app\.set\('trust proxy', trustProxySetting\(process\.env\.ACCOUNT_TRUST_PROXY\)\)/);
  assert.match(source, /const key = `rl:\$\{rateLimitKey\(ip\)\}`/);
  assert.match(source, /production && !process\.env\.ACCOUNT_TRUST_PROXY\?\.trim\(\)/);
});
