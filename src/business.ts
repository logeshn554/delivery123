const safeUrl = (value: string | undefined) => { try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
export const business = {
  name: import.meta.env.VITE_BUSINESS_NAME || 'AllGo',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || '',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || '',
  cities: import.meta.env.VITE_SERVICE_CITIES || '',
  privacy: safeUrl(import.meta.env.VITE_PRIVACY_URL),
  terms: safeUrl(import.meta.env.VITE_TERMS_URL),
  cancellation: safeUrl(import.meta.env.VITE_CANCELLATION_URL),
};
