const DURATIONS = new Set(['hourly', 'halfday', 'fullday']);
const TRANSMISSIONS = new Set(['manual', 'automatic']);

function validateTakeoverDetails(details = {}) {
  if (!DURATIONS.has(details.takeoverOption)) throw new Error('Choose a supported driver duration.');
  if (!TRANSMISSIONS.has(details.takeoverTransmission)) throw new Error('Choose manual or automatic transmission.');
  return { takeoverOption: details.takeoverOption, takeoverTransmission: details.takeoverTransmission };
}

module.exports = { validateTakeoverDetails };
