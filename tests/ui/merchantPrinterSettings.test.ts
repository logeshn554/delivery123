import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MERCHANT_PRINTER_SETTINGS_KEY,
  readMerchantPrinterSettings,
  saveMerchantPrinterSettings,
  type MerchantPrinterSettings,
} from '../../src/design-system/merchantPrinterSettings.ts';

function fakeStorage(initial?: string, fail = false) {
  let value = initial;
  let key = '';
  return {
    getItem: () => { if (fail) throw new Error('blocked'); return value ?? null; },
    setItem: (nextKey: string, next: string) => { if (fail) throw new Error('blocked'); key = nextKey; value = next; },
    value: () => value,
    key: () => key,
  };
}

test('merchant printer defaults are validated and stored as device-local preferences', () => {
  const storage = fakeStorage();
  const settings: MerchantPrinterSettings = { address: 'aa:bb:cc:dd:ee:ff', paperWidth: 48 };
  assert.equal(saveMerchantPrinterSettings(settings, storage), true);
  assert.equal(storage.key(), MERCHANT_PRINTER_SETTINGS_KEY);
  assert.deepEqual(readMerchantPrinterSettings(storage), { address: 'AA:BB:CC:DD:EE:FF', paperWidth: 48 });
});

test('malformed or unavailable printer storage fails safely to 58 mm and no selected device', () => {
  assert.deepEqual(readMerchantPrinterSettings(fakeStorage('{bad json')), { address: '', paperWidth: 32 });
  assert.deepEqual(readMerchantPrinterSettings(fakeStorage(undefined, true)), { address: '', paperWidth: 32 });
  assert.equal(saveMerchantPrinterSettings({ address: 'not-a-device', paperWidth: 32 }, fakeStorage()), false);
  assert.equal(saveMerchantPrinterSettings({ address: '', paperWidth: 80 as 32 }, fakeStorage()), false);
});
