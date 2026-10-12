const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scannerConfig, streamFrames, signatureVersion, scanBytes } = require('./clamScanner');
const config = { host: 'scanner.example.test', port: 443, ca: '-----BEGIN CERTIFICATE-----', cert: '-----BEGIN CERTIFICATE-----', key: ['-----BEGIN PRIVATE', 'KEY-----'].join(' ') };
const now = Date.UTC(2026, 9, 11, 12), version = 'ClamAV 1.4.3/30000/Sun Oct 11 10:00:00 2026';
test('scanner transport requires mutual TLS and frames bounded bytes with network-order chunk lengths', () => {
  const options = scannerConfig(config); assert.equal(options.rejectUnauthorized, true); assert.equal(options.servername, config.host); assert.equal(options.minVersion, 'TLSv1.2');
  assert.throws(() => scannerConfig({ ...config, key: '' })); assert.throws(() => scannerConfig({ ...config, host: '127.0.0.1' }));
  const bytes = Buffer.alloc(70000, 1), frames = streamFrames(bytes);
  assert.equal(frames[0].toString(), 'zINSTREAM\0'); assert.equal(frames[1].readUInt32BE(), 65536); assert.equal(frames[3].readUInt32BE(), 4464); assert.equal(frames.at(-1).readUInt32BE(), 0);
  assert.equal(Buffer.concat([frames[2], frames[4]]).equals(bytes), true);
});
test('scanner rejects stale signatures, unexpected replies and service failures instead of declaring clean', async () => {
  assert.equal(signatureVersion(version, now).signatureVersion, '30000');
  assert.throws(() => signatureVersion('ClamAV 1.4.3/1/Fri Oct 09 09:00:00 2026', now)); assert.throws(() => signatureVersion('COMMAND UNAVAILABLE', now));
  for (const [reply, verdict] of [['stream: OK', 'clean'], ['stream: Eicar-Test-Signature FOUND', 'infected']]) {
    let commands = 0;
    const result = await scanBytes(Buffer.from('fixture bytes'), config, async (connection, frames) => { assert.equal(connection.rejectUnauthorized, true); commands++; return frames[0].toString() === 'zVERSION\0' ? version : reply; }, now);
    assert.equal(result.verdict, verdict); assert.equal(commands, 2);
  }
  await assert.rejects(scanBytes(Buffer.from('fixture'), config, async (_, frames) => frames[0].toString() === 'zVERSION\0' ? version : 'stream: size limit exceeded ERROR', now));
  await assert.rejects(scanBytes(Buffer.from('fixture'), config, async () => { throw new Error('Connection failed'); }, now));
});
