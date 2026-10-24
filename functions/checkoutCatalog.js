// Resolve against the authoritative catalog both when quoting and committing.
// A valid existing quote retains its price; availability must still be current.
function checkoutCatalogItem(product, variantId, serviceType, quantity, now = Date.now(), addOnIds = []) {
  if (!product || !['food', 'grocery'].includes(serviceType) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 30) throw new Error('An item in your cart is no longer available.');
  let price = product.price;
  let variantName;
  let selectedAddOns = [];
  if (serviceType === 'grocery') {
    const { productWithinExpiry } = require('./productExpiry');
    if (variantId || addOnIds.length) throw new Error('Grocery products do not support menu options.');
    if (!productWithinExpiry(product, now) || !Number.isSafeInteger(product.stock) || product.stock < quantity) throw new Error('An item has insufficient stock or has expired.');
  } else {
    if (product.available === false) throw new Error('A restaurant item is no longer available.');
    if (product.variants !== undefined && !Array.isArray(product.variants)) throw new Error('Menu options need merchant review.');
    if (product.variants?.length) {
      if (!variantId) throw new Error('This dish requires an option selection. Refresh your cart.');
      const matches = product.variants.filter(variant => variant?.id === variantId);
      if (matches.length !== 1 || matches[0].available === false || typeof matches[0].label !== 'string' || !matches[0].label.trim() || matches[0].label.trim().length > 80) throw new Error('A selected menu option is no longer available. Refresh your cart.');
      price = matches[0].price;
      variantName = matches[0].label.trim();
    } else if (variantId) throw new Error('A selected menu option is no longer available. Refresh your cart.');
    if (!Array.isArray(addOnIds) || addOnIds.length > 100 || addOnIds.some(id => typeof id !== 'string') || new Set(addOnIds).size !== addOnIds.length) throw new Error('The selected add-ons are invalid. Refresh your cart.');
    const groups = product.addOnGroups ?? [];
    if (!Array.isArray(groups) || groups.length > 10 || addOnIds.length && !groups.length) throw new Error('Dish add-ons need merchant review.');
    const selected = new Set(addOnIds);
    const known = new Set();
    const groupIds = new Set();
    for (const group of groups) {
      if (!group || typeof group.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(group.id) || groupIds.has(group.id) || typeof group.label !== 'string' || !group.label.trim() || group.label.length > 80 || typeof group.required !== 'boolean' || !Array.isArray(group.options) || !group.options.length || group.options.length > 20 || !Number.isInteger(group.maxSelections) || group.maxSelections < 1 || group.maxSelections > Math.min(10, group.options.length)) throw new Error('Dish add-ons need merchant review.');
      groupIds.add(group.id);
      const localIds = new Set();
      for (const option of group.options) {
        if (!option || typeof option.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(option.id) || known.has(option.id) || localIds.has(option.id) || typeof option.label !== 'string' || !option.label.trim() || option.label.length > 80 || typeof option.available !== 'boolean' || !Number.isFinite(option.price) || option.price < 0 || option.price > 100000 || Math.abs(option.price * 100 - Math.round(option.price * 100)) > 0.000001) throw new Error('Dish add-ons need merchant review.');
        localIds.add(option.id);
        known.add(option.id);
      }
      const options = group.options.filter(option => selected.has(option?.id));
      if (options.length > group.maxSelections || group.required && options.length < 1) throw new Error('Choose the required dish add-ons.');
      if (options.some(option => option.available === false || typeof option.label !== 'string' || !option.label.trim() || !Number.isFinite(option.price) || option.price < 0 || option.price > 100000 || Math.abs(option.price * 100 - Math.round(option.price * 100)) > 0.000001)) throw new Error('A selected add-on is no longer available. Refresh your cart.');
      selectedAddOns.push(...options.map(option => ({ id: option.id, name: option.label.trim(), price: option.price })));
      price += options.reduce((sum, option) => sum + option.price, 0);
    }
    if (addOnIds.some(id => !known.has(id))) throw new Error('A selected add-on is no longer available. Refresh your cart.');
  }
  const unitCents = Math.round(price * 100);
  if (!Number.isFinite(price) || price <= 0 || price > 100000 || !Number.isSafeInteger(unitCents) || Math.abs(price * 100 - unitCents) > 0.000001) throw new Error('An item has an invalid catalog price.');
  return { price, unitCents, ...(variantName ? { variantName } : {}), ...(selectedAddOns.length ? { addOns: selectedAddOns } : {}) };
}
module.exports = { checkoutCatalogItem };
