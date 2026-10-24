import { useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Booking } from '../types';
import { buildEscPosReceipt, bytesToBase64 } from '../design-system/escPos';

interface PairedPrinter { address: string; name: string }
interface EscPosPrinter { listPairedPrinters(): Promise<{ printers: PairedPrinter[] }>; printReceipt(options: { address: string; data: string }): Promise<void> }
const printer = registerPlugin<EscPosPrinter>('EscPosPrinter');

function printSystemReceipt(bookingId: string) {
  const target = document.getElementById(`merchant-order-print-${bookingId}`);
  if (!target) { window.print(); return; }
  target.setAttribute('data-allgo-print-selected', 'true');
  document.body.setAttribute('data-allgo-merchant-print', 'true');
  window.addEventListener('afterprint', () => {
    target.removeAttribute('data-allgo-print-selected');
    document.body.removeAttribute('data-allgo-merchant-print');
  }, { once: true });
  window.print();
}

export default function MerchantThermalPrint({ booking }: { booking: Booking }) {
  const [printers, setPrinters] = useState<PairedPrinter[]>([]);
  const [selected, setSelected] = useState('');
  const [paperWidth, setPaperWidth] = useState(32);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (Capacitor.getPlatform() !== 'android') return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => printSystemReceipt(booking.bookingId)} className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-white">Print via system dialog</button>
    <span className="text-xs text-slate-400">Direct Bluetooth printing requires a paired ESC/POS printer on Android.</span>
  </div>;

  const loadPrinters = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await printer.listPairedPrinters();
      setPrinters(result.printers);
      if (!result.printers.length) setMessage('Pair a Bluetooth Classic ESC/POS printer in Android Settings, then try again.');
      else setSelected(current => result.printers.some(item => item.address === current) ? current : result.printers[0].address);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not access paired printers.'); }
    finally { setBusy(false); }
  };
  const print = async () => {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      await printer.printReceipt({ address: selected, data: bytesToBase64(buildEscPosReceipt(booking, paperWidth)) });
      setMessage('Receipt sent to printer.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not print receipt.'); }
    finally { setBusy(false); }
  };

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={busy} onClick={() => void loadPrinters()} className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Bluetooth printer</button>
    {printers.length > 0 && <>
      <label className="sr-only" htmlFor={`printer-${booking.bookingId}`}>Paired receipt printer</label>
      <select id={`printer-${booking.bookingId}`} value={selected} onChange={event => setSelected(event.target.value)} className="min-h-10 max-w-48 rounded-lg border border-slate-600 bg-slate-900 px-2 text-xs text-white">
        {printers.map(item => <option key={item.address} value={item.address}>{item.name}</option>)}
      </select>
      <label className="sr-only" htmlFor={`paper-width-${booking.bookingId}`}>Printer paper width</label>
      <select id={`paper-width-${booking.bookingId}`} value={paperWidth} onChange={event => setPaperWidth(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-600 bg-slate-900 px-2 text-xs text-white">
        <option value={32}>58 mm paper</option><option value={48}>80 mm paper</option>
      </select>
      <button type="button" disabled={busy || !selected} onClick={() => void print()} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Printing…' : 'Print order'}</button>
    </>}
    {message && <p className="basis-full text-xs text-slate-300" role="status">{message}</p>}
  </div>;
}
