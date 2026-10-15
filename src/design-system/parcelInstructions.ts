export const PARCEL_INSTRUCTIONS_LIMIT = 500;
const PICKUP_LABEL = 'Pickup access: ';
const DELIVERY_LABEL = 'Delivery instructions: ';

export function getPickupInstructionsLimit(deliveryInstructions: string): number {
  const delivery = deliveryInstructions.trim();
  return Math.max(0, PARCEL_INSTRUCTIONS_LIMIT - PICKUP_LABEL.length - (delivery ? DELIVERY_LABEL.length + delivery.length + 1 : 0));
}

export function getDeliveryInstructionsLimit(pickupInstructions: string): number {
  const pickup = pickupInstructions.trim();
  return Math.max(0, PARCEL_INSTRUCTIONS_LIMIT - DELIVERY_LABEL.length - (pickup ? PICKUP_LABEL.length + pickup.length + 1 : 0));
}

export function buildParcelInstructions(pickupInstructions: string, deliveryInstructions: string): string {
  const pickup = pickupInstructions.trim();
  const delivery = deliveryInstructions.trim();
  return [pickup ? `${PICKUP_LABEL}${pickup}` : '', delivery ? `${DELIVERY_LABEL}${delivery}` : '']
    .filter(Boolean)
    .join('\n');
}
