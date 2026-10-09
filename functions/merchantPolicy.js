const days = ['sun','mon','tue','wed','thu','fri','sat'];
function minute(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Opening hours must use HH:mm.');
  const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes;
}
function validateHours(hours) {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours) || Object.keys(hours).some(day => !days.includes(day))) throw new Error('Choose valid opening days.');
  const result = {};
  for (const day of days) {
    const windows = hours[day] ?? [];
    if (!Array.isArray(windows) || windows.length > 4) throw new Error('Use at most four opening periods per day.');
    result[day] = windows.map(window => { if (minute(window.open) === minute(window.close)) throw new Error('Opening and closing times must differ.'); return { open: window.open, close: window.close }; });
  }
  return result;
}
function merchantOpen(merchant, now = new Date()) {
  if (merchant.acceptingOrders === false) return false;
  if (!merchant.weeklyHours) return true; // Existing operators can explicitly manage acceptingOrders.
  const hours = validateHours(merchant.weeklyHours);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: merchant.timeZone || 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = type => parts.find(entry => entry.type === type)?.value;
  const day = part('weekday').toLowerCase(), current = Number(part('hour')) * 60 + Number(part('minute'));
  const previous = days[(days.indexOf(day) + 6) % 7];
  return hours[day].some(window => { const open = minute(window.open), close = minute(window.close); return close > open ? current >= open && current < close : current >= open; }) || hours[previous].some(window => minute(window.close) < minute(window.open) && current < minute(window.close));
}
module.exports = { validateHours, merchantOpen };
