// Resolve against the authoritative catalog both when quoting and committing.
// A valid existing quote retains its price; availability must still be current.
function checkoutCatalogItem(product, variantId, serviceType, quantity, now = Date.now()) {
  if (!product || !['food', 'grocery'].includes(serviceType) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 30) throw new Error('An item in your cart is no longer available.');
  let price = product.price;
  let variantName;
  if (serviceType === 'grocery') {
    const { productWithinExpiry } = require('./productExpiry');
    if (variantId) throw new Error('Grocery products do not support menu variants.');
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
  }
  const unitCents = Math.round(price * 100);
  if (!Number.isFinite(price) || price <= 0 || price > 100000 || !Number.isSafeInteger(unitCents) || Math.abs(price * 100 - unitCents) > 0.000001) throw new Error('An item has an invalid catalog price.');
  return { price, unitCents, ...(variantName ? { variantName } : {}) };
}
module.exports = { checkoutCatalogItem };
