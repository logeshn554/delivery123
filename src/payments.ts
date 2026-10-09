import { Capacitor } from '@capacitor/core';
import { Checkout } from 'capacitor-razorpay';
export interface PaymentReceipt { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }
interface WebCheckout { open(): void; on(event: string, callback: () => void): void; }
type CheckoutConstructor = new (options: Record<string, unknown>) => WebCheckout;
let loading: Promise<CheckoutConstructor> | undefined;
function loadCheckout() {
  const constructor = (window as unknown as { Razorpay?: CheckoutConstructor }).Razorpay;
  if (constructor) return Promise.resolve(constructor);
  if (!loading) loading = new Promise<CheckoutConstructor>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Payment checkout could not load. Check your connection and try again.')); };
    const timer = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); const value = (window as unknown as { Razorpay?: CheckoutConstructor }).Razorpay; if (value) resolve(value); else fail(); };
    document.head.appendChild(script);
  });
  return loading;
}
export async function openPaymentCheckout(options: Record<string, unknown>): Promise<PaymentReceipt> {
  if (Capacitor.isNativePlatform()) {
    const checkout = await Checkout.open(options as Parameters<typeof Checkout.open>[0]);
    const raw = (checkout as { response?: unknown }).response ?? checkout;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as PaymentReceipt;
  }
  const Constructor = await loadCheckout();
  return new Promise<PaymentReceipt>((resolve, reject) => {
    const checkout = new Constructor({ ...options, handler: resolve, modal: { ondismiss: () => reject(new Error('Checkout was closed. Check payment activity if your bank was debited.')) } });
    checkout.on('payment.failed', () => reject(new Error('Payment was not confirmed. Check payment activity before retrying.')));
    checkout.open();
  });
}
