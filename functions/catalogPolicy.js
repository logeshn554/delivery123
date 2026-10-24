const { validExpiry } = require('./productExpiry');
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
    if (input.addOnGroups !== undefined) {
      if (!Array.isArray(input.addOnGroups) || input.addOnGroups.length > 10) throw new Error('Use at most ten add-on groups.');
      const groupIds = new Set(), optionIds = new Set();
      result.addOnGroups = input.addOnGroups.map(group => {
        if (!group || typeof group.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(group.id) || groupIds.has(group.id) || typeof group.label !== 'string' || !group.label.trim() || group.label.length > 80 || typeof group.required !== 'boolean' || !Number.isInteger(group.maxSelections) || group.maxSelections < 1 || group.maxSelections > 10 || !Array.isArray(group.options) || !group.options.length || group.options.length > 20) throw new Error('Each add-on group needs a unique ID, label, selection limit and options.');
        groupIds.add(group.id);
        const options = group.options.map(option => {
          if (!option || typeof option.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(option.id) || optionIds.has(option.id) || typeof option.label !== 'string' || !option.label.trim() || option.label.length > 80 || typeof option.available !== 'boolean' || !Number.isFinite(option.price) || option.price < 0 || option.price > 100000 || Math.abs(option.price * 100 - Math.round(option.price * 100)) > 0.000001) throw new Error('Add-on options need unique IDs, labels, valid prices and availability.');
          optionIds.add(option.id);
          return { id: option.id, label: option.label.trim(), price: option.price, available: option.available };
        });
        if (group.maxSelections > options.length) throw new Error('An add-on group selection limit cannot exceed its available options.');
        if (group.required && !options.some(option => option.available)) throw new Error('A required add-on group must have an available option.');
        return { id: group.id, label: group.label.trim(), required: group.required, maxSelections: group.maxSelections, options };
      });
    }
  } else {
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 1000000) throw new Error('Enter a valid stock count.');
    Object.assign(result, { stock: input.stock, unit: text('unit',80,true), brand: text('brand',100), storageInstructions: text('storageInstructions',1000), countryOfOrigin: text('countryOfOrigin',100), expiresAt: validExpiry(input.expiresAt) });
  }
  return result;
}
module.exports = { catalogItem };
