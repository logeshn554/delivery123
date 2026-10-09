function catalogItem(input, type) {
  if (!input || typeof input !== 'object' || !['restaurant','grocery'].includes(type)) throw new Error('Invalid catalog item.');
  const text = (key, max, required = false) => { const value = input[key] ?? ''; if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) throw new Error(`Enter a valid ${key}.`); return value.trim(); };
  const price = input.price;
  if (!Number.isFinite(price) || price <= 0 || price > 100000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw new Error('Enter a positive price with at most two decimal places.');
  const image = text('image', 2048);
  if (image) { let parsed; try { parsed = new URL(image); } catch { throw new Error('Use an HTTPS image address.'); } if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Use an HTTPS image address.'); }
  const allergens = input.allergens ?? [];
  if (!Array.isArray(allergens) || allergens.length > 30 || allergens.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw new Error('Enter valid allergen names.');
  const result = { name: text('name',120,true), category: text('category',80,true), description: text('description',2000), ingredients: text('ingredients',2000), allergens: [...new Set(allergens.map(value=>value.trim()))], image, price };
  if (type === 'restaurant') {
    if (typeof input.available !== 'boolean' || typeof input.isVeg !== 'boolean') throw new Error('Choose dish availability and vegetarian status.');
    Object.assign(result, { available: input.available, isVeg: input.isVeg, servingSize: text('servingSize',100) });
    if (input.variants !== undefined) {
      if (!Array.isArray(input.variants) || input.variants.length > 20) throw new Error('Use at most twenty dish variants.');
      const ids = new Set();
      result.variants = input.variants.map(variant=>{ if (!variant || typeof variant.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(variant.id) || ids.has(variant.id) || typeof variant.label !== 'string' || !variant.label.trim() || variant.label.length > 80 || typeof variant.available !== 'boolean' || !Number.isFinite(variant.price) || variant.price <= 0 || variant.price > 100000 || Math.abs(variant.price * 100 - Math.round(variant.price * 100)) > 0.000001) throw new Error('Dish variants need unique IDs, labels, prices and availability.'); ids.add(variant.id); return { id: variant.id, label: variant.label.trim(), price: variant.price, available: variant.available }; });
    }
  } else {
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 1000000) throw new Error('Enter a valid stock count.');
    Object.assign(result, { stock: input.stock, unit: text('unit',80,true), brand: text('brand',100), storageInstructions: text('storageInstructions',1000), countryOfOrigin: text('countryOfOrigin',100) });
  }
  return result;
}
module.exports = { catalogItem };
