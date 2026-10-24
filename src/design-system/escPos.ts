import type { Booking } from '../types';
import { buildOrderReceiptText } from './receipt';

function asciiReceipt(text: string, width: number): string[] {
  const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replaceAll('₹', 'Rs ').replaceAll('×', 'x').replace(/[—–]/g, '-').replace(/[^\x20-\x7E\n]/g, '?');
  const lines: string[] = [];
  for (const raw of normalized.split(/\r?\n/)) {
    if (!raw) { lines.push(''); continue; }
    let remaining = raw.trim();
    while (remaining.length > width) {
      let splitAt = remaining.lastIndexOf(' ', width);
      if (splitAt < 1) splitAt = width;
      lines.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    lines.push(remaining);
  }
  return lines;
}

export function buildEscPosReceipt(booking: Booking, width = 32): Uint8Array {
  if (!Number.isInteger(width) || width < 24 || width > 48) throw new Error('Unsupported printer paper width.');
  const encoded = new TextEncoder().encode(asciiReceipt(buildOrderReceiptText(booking), width).join('\n'));
  const command = new Uint8Array(2 + encoded.length + 8);
  command.set([0x1b, 0x40, ...encoded], 0);
  command.set([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00, 0x00], 2 + encoded.length);
  return command;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
