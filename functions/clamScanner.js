const tls = require('node:tls');
const { MAX_EVIDENCE_BYTES } = require('./evidencePolicy');
function scannerConfig(data) {
  if (typeof data?.host !== 'string' || !/^(?=.{1,253}$)[A-Za-z0-9.-]+$/.test(data.host) || !data.host.includes('.') || ['localhost', '127.0.0.1'].includes(data.host) || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535 || ![data.ca, data.cert].every(value => typeof value === 'string' && value.includes('-----BEGIN CERTIFICATE-----')) || typeof data.key !== 'string' || !/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(data.key)) throw new Error('A verified mutual-TLS scanner endpoint is required.');
  return { host: data.host, servername: data.host, port: data.port, ca: data.ca, cert: data.cert, key: data.key, rejectUnauthorized: true, minVersion: 'TLSv1.2' };
}
function streamFrames(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error('Scanner input exceeds the document limit.');
  const frames = [Buffer.from('zINSTREAM\0')];
  for (let offset = 0; offset < bytes.length; offset += 65536) { const chunk = bytes.subarray(offset, offset + 65536), length = Buffer.alloc(4); length.writeUInt32BE(chunk.length); frames.push(length, chunk); }
  frames.push(Buffer.alloc(4)); return frames;
}
function exchange(config, frames) {
  return new Promise((resolve, reject) => {
    let settled = false, output = Buffer.alloc(0), socket;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); socket?.destroy(); error ? reject(new Error('The scanner could not confirm document safety.')) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('Timeout')), 30000);
    try { socket = tls.connect(config); } catch { finish(new Error('Connection')); return; }
    socket.on('error', error => finish(error)); socket.on('close', () => { if (!settled) finish(new Error('Incomplete response')); });
    socket.on('data', chunk => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 2048) { finish(new Error('Response limit')); return; }
      const end = output.indexOf(0);
      if (end >= 0) finish(null, output.subarray(0, end).toString('utf8'));
    });
    socket.once('secureConnect', async () => {
      if (!socket.authorized) { finish(new Error('Certificate')); return; }
      try { for (const frame of frames) { if (settled) return; await new Promise((done, failed) => socket.write(frame, error => error ? failed(error) : done())); } }
      catch (error) { finish(error); }
    });
  });
}
function signatureVersion(response, now = Date.now()) {
  const match = /^ClamAV ([0-9]+\.[0-9]+\.[0-9]+(?:[-A-Za-z0-9.]*)?)\/([0-9]+)\/(.+)$/.exec(response);
  const updated = match ? Date.parse(`${match[3]} UTC`) : NaN;
  if (!Number.isFinite(updated) || updated > now + 300000 || now - updated > 48 * 3600000) throw new Error('Scanner signatures are missing, stale or have an invalid time.');
  return { engineVersion: match[1], signatureVersion: match[2], signaturesUpdatedAt: new Date(updated).toISOString() };
}
async function scanBytes(bytes, config, transport = exchange, now = Date.now()) {
  const connection = scannerConfig(config), frames = streamFrames(bytes);
  const version = signatureVersion(await transport(connection, [Buffer.from('zVERSION\0')]), now);
  const response = await transport(connection, frames);
  if (response === 'stream: OK') return { verdict: 'clean', ...version };
  if (/^stream: [^\r\n\0]{1,500} FOUND$/.test(response)) return { verdict: 'infected', ...version };
  throw new Error('The scanner did not return a recognized safety verdict.');
}
module.exports = { scannerConfig, streamFrames, signatureVersion, scanBytes };
