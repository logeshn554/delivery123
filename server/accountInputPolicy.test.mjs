import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { accountObjectBody } from './accountInputPolicy.mjs';
import { accountErrorResponse } from './accountErrorPolicy.mjs';

test('account HTTP input boundary rejects invalid bodies without reflecting secrets or reaching handlers', async () => {
  const app = express();
  let handled = 0;
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', accountObjectBody);
  app.all('/api/account', (req, res) => { handled++; res.json({ ok: true, body: req.body }); });
  app.use((error, _req, res, _next) => {
    const result = accountErrorResponse(error);
    res.status(result.status).json(result.body);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${server.address().port}/api/account`;
  try {
    const secret = 'private-password-do-not-reflect';
    for (const [body, status, contentType] of [
      [`{"password":"${secret}",}`, 400, 'application/json'],
      ['[]', 400, 'application/json'], ['null', 400, 'application/json'],
      ['"scalar"', 400, 'application/json'], ['', 400, 'text/plain'],
      [JSON.stringify({ password: secret, data: 'x'.repeat(17000) }), 413, 'application/json'],
      ['{}', 415, 'application/json; charset=invalid'],
    ]) {
      const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': contentType }, body });
      assert.equal(response.status, status);
      const result = await response.json();
      assert.equal(result.code, 'invalid-argument');
      assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    }
    assert.equal(handled, 0);
    for (const method of ['POST', 'PATCH', 'PUT']) {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: '{"name":"Customer"}' });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).body, { name: 'Customer' });
    }
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url, { method: 'DELETE' })).status, 200);
    // Existing logout and service-identity clients send a JSON header without a body.
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
