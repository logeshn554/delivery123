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
module.exports = { validateParcelContents, separateParcelContacts };
