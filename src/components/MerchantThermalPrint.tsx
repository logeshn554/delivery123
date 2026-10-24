import { useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Bluetooth, Printer } from 'lucide-react';
import type { Booking } from '../types';
import { buildEscPosPrinterTest, buildEscPosReceipt, bytesToBase64 } from '../design-system/escPos';
import { readMerchantPrinterSettings, saveMerchantPrinterSettings, type MerchantPrinterPaperWidth } from '../design-system/merchantPrinterSettings';

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
  const [selected, setSelected] = useState(() => readMerchantPrinterSettings().address);
  const [paperWidth, setPaperWidth] = useState<MerchantPrinterPaperWidth>(() => readMerchantPrinterSettings().paperWidth);
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
      <select id={`paper-width-${booking.bookingId}`} value={paperWidth} onChange={event => setPaperWidth(Number(event.target.value) as MerchantPrinterPaperWidth)} className="min-h-10 rounded-lg border border-slate-600 bg-slate-900 px-2 text-xs text-white">
        <option value={32}>58 mm paper</option><option value={48}>80 mm paper</option>
      </select>
      <button type="button" disabled={busy || !selected} onClick={() => void print()} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Printing…' : 'Print order'}</button>
    </>}
    {message && <p className="basis-full text-xs text-slate-300" role="status">{message}</p>}
  </div>;
}

export function MerchantPrinterSettings() {
  const [printers, setPrinters] = useState<PairedPrinter[]>([]);
  const [settings, setSettings] = useState(() => readMerchantPrinterSettings());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (Capacitor.getPlatform() !== 'android') return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700" aria-labelledby="merchant-printer-settings-title">
    <h3 id="merchant-printer-settings-title" className="font-semibold">Printer / POS integration</h3>
    <p className="mt-2">Direct Bluetooth ESC/POS setup is available in the Android Merchant app. Other devices can print through the system dialog on each order.</p>
  </section>;

  const loadPrinters = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await printer.listPairedPrinters();
      setPrinters(result.printers);
      if (!result.printers.length) setMessage('No paired printers found. Pair a Bluetooth Classic ESC/POS printer in Android Settings, then refresh.');
      else if (!result.printers.some(item => item.address === settings.address)) setSettings(current => ({ ...current, address: result.printers[0].address }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not access paired printers.'); }
    finally { setBusy(false); }
  };

  const save = () => {
    setMessage(saveMerchantPrinterSettings(settings) ? 'Default printer settings saved on this device.' : 'Settings could not be saved on this device.');
  };

  const testPrint = async () => {
    if (!settings.address) return;
    setBusy(true); setMessage('');
    try {
      await printer.printReceipt({ address: settings.address, data: bytesToBase64(buildEscPosPrinterTest()) });
      setMessage('Test receipt sent to printer.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not print the test receipt.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900" aria-labelledby="merchant-printer-settings-title">
    <div className="flex items-start gap-3">
      <Printer size={20} aria-hidden="true" className="mt-0.5 text-indigo-700" />
      <div><h3 id="merchant-printer-settings-title" className="font-semibold">Printer / POS integration</h3><p className="mt-1 text-sm text-slate-600">Configure a paired Bluetooth Classic ESC/POS printer for order receipts. The printer only starts when you press Print on an order.</p></div>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <button type="button" disabled={busy} onClick={() => void loadPrinters()} className="min-h-11 rounded-lg border px-3 font-semibold disabled:opacity-50"><Bluetooth size={16} aria-hidden="true" className="mr-2 inline"/>{busy ? 'Please wait…' : 'Find paired printers'}</button>
      {printers.length > 0 && <>
        <label className="grid gap-1 text-sm">Default receipt printer<select className="min-h-11 max-w-64 rounded-lg border bg-white px-3" value={settings.address} onChange={event => setSettings(current => ({ ...current, address: event.target.value }))}>{printers.map(item => <option key={item.address} value={item.address}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Paper width<select className="min-h-11 rounded-lg border bg-white px-3" value={settings.paperWidth} onChange={event => setSettings(current => ({ ...current, paperWidth: Number(event.target.value) as MerchantPrinterPaperWidth }))}><option value={32}>58 mm</option><option value={48}>80 mm</option></select></label>
        <button type="button" disabled={busy} onClick={save} className="min-h-11 rounded-lg bg-indigo-700 px-3 font-semibold text-white disabled:opacity-50">Save default</button>
        <button type="button" disabled={busy || !settings.address} onClick={() => void testPrint()} className="min-h-11 rounded-lg border border-emerald-700 px-3 font-semibold text-emerald-800 disabled:opacity-50">Print test receipt</button>
      </>}
    </div>
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </section>;
}
