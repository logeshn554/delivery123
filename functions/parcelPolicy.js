function bounded(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`Enter a valid ${label}.`);
  return value.trim();
}
function validateParcelContents(requested) {
  const contacts = requested.parcelContacts;
  if (!contacts || typeof contacts !== 'object') throw new Error('Provide sender and recipient contact details.');
  const senderPhone = bounded(contacts.senderPhone, 'sender phone', 9, 16);
  const recipientPhone = bounded(contacts.recipientPhone, 'recipient phone', 9, 16);
  if (!/^\+[1-9]\d{7,14}$/.test(senderPhone) || !/^\+[1-9]\d{7,14}$/.test(recipientPhone)) throw new Error('Use phone numbers with country codes.');
  if (requested.restrictedItemsConfirmed !== true) throw new Error('Confirm the shipping requirements before booking.');
  if (!Number.isSafeInteger(requested.declaredValue) || requested.declaredValue < 0 || requested.declaredValue > 1000000) throw new Error('Enter a valid declared value.');
  return {
    parcelContacts: {
      senderName: bounded(contacts.senderName, 'sender name', 2, 100), senderPhone,
      recipientName: bounded(contacts.recipientName, 'recipient name', 2, 100), recipientPhone,
    },
    parcelDescription: bounded(requested.parcelDescription, 'package contents', 3, 200),
    declaredValue: requested.declaredValue,
    fragile: requested.fragile === true,
    restrictedItemsConfirmed: true,
  };
}
function separateParcelContacts(details = {}) {
  const { parcelContacts, ...publicDetails } = details;
  return { parcelContacts, publicDetails };
}
function parcelWeight(weightKg, dimensions, option) {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 50) throw new Error('Enter a parcel weight between 0 and 50 kg.');
  if (!dimensions) return { actualWeightKg: weightKg, volumetricWeightKg: 0, billableWeightKg: weightKg };
  const { lengthCm, widthCm, heightCm } = dimensions;
  if ([lengthCm, widthCm, heightCm].some(value => !Number.isFinite(value) || value <= 0 || value > 300)) throw new Error('Each package dimension must be between 0 and 300 cm.');
  if (!Number.isFinite(option.volumetricDivisor) || option.volumetricDivisor <= 0) throw new Error('Volumetric parcel pricing is not configured.');
  if (option.maxDimensionCm !== undefined && (!Number.isFinite(option.maxDimensionCm) || Math.max(lengthCm, widthCm, heightCm) > option.maxDimensionCm)) throw new Error('The package exceeds this service dimension limit.');
  const volumetricWeightKg = Math.ceil(lengthCm * widthCm * heightCm / option.volumetricDivisor * 100) / 100;
  return { dimensions: { lengthCm, widthCm, heightCm }, actualWeightKg: weightKg, volumetricWeightKg, billableWeightKg: Math.max(weightKg, volumetricWeightKg) };
}
module.exports = { validateParcelContents, separateParcelContacts, parcelWeight };
