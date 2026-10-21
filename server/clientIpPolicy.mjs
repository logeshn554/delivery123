import { isIP } from 'node:net';

const MAX_PROXY_HOPS = 5;

// ACCOUNT_TRUST_PROXY is the number of reverse-proxy hops in front of the account API
// (0 = clients connect directly). All request paths must have the configured
// number of proxies, and the edge must append/replace forwarded headers. A
// shorter, directly reachable path can make a hop-based policy trust spoofed IPs.
// Named/CIDR trust policies are intentionally outside this configuration format.
export function trustProxySetting(value) {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) > MAX_PROXY_HOPS) {
    throw new Error(`ACCOUNT_TRUST_PROXY must be a whole number of reverse-proxy hops from 0 to ${MAX_PROXY_HOPS}.`);
  }
  const hops = Number(text);
  return hops === 0 ? false : hops;
}

function expandIpv6(address) {
  let text = address.split('%')[0].toLowerCase();
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    text = text.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail === undefined ? [] : tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map(group => group.padStart(4, '0'));
}

// Stable per-client key for abuse limits. IPv4-mapped IPv6 addresses are treated as IPv4, and IPv6
// clients are grouped by /64 so one network cannot dodge the limit by rotating host addresses.
export function rateLimitKey(ip) {
  if (typeof ip !== 'string') return 'unknown';
  const address = ip.trim();
  const kind = isIP(address.split('%')[0]);
  if (!kind) return 'unknown';
  if (kind === 4) return address.includes('%') ? 'unknown' : address;
  const groups = expandIpv6(address);
  if (groups.length !== 8) return 'unknown';
  if (groups.slice(0, 5).every(group => group === '0000') && groups[5] === 'ffff') {
    return [parseInt(groups[6].slice(0, 2), 16), parseInt(groups[6].slice(2), 16), parseInt(groups[7].slice(0, 2), 16), parseInt(groups[7].slice(2), 16)].join('.');
  }
  return `v6:${groups.slice(0, 4).join(':')}`;
}
