export type MerchantPrinterPaperWidth = 32 | 48;

export interface MerchantPrinterSettings {
  address: string;
  paperWidth: MerchantPrinterPaperWidth;
}

export const MERCHANT_PRINTER_SETTINGS_KEY = 'allgo:merchant-printer-settings:v1';

const defaults: MerchantPrinterSettings = { address: '', paperWidth: 32 };
const validAddress = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

type PrinterSettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readMerchantPrinterSettings(storage: PrinterSettingsStorage | undefined = browserStorage()): MerchantPrinterSettings {
  try {
    const value = JSON.parse(storage?.getItem(MERCHANT_PRINTER_SETTINGS_KEY) || 'null') as Partial<MerchantPrinterSettings> | null;
    return {
      address: typeof value?.address === 'string' && validAddress.test(value.address) ? value.address.toUpperCase() : defaults.address,
      paperWidth: value?.paperWidth === 48 ? 48 : defaults.paperWidth,
    };
  } catch { return { ...defaults }; }
}

export function saveMerchantPrinterSettings(settings: MerchantPrinterSettings, storage: PrinterSettingsStorage | undefined = browserStorage()): boolean {
  if (!settings || (settings.address && !validAddress.test(settings.address)) || ![32, 48].includes(settings.paperWidth)) return false;
  try {
    if (!storage) return false;
    storage.setItem(MERCHANT_PRINTER_SETTINGS_KEY, JSON.stringify({ address: settings.address.toUpperCase(), paperWidth: settings.paperWidth }));
    return true;
  } catch { return false; }
}
