export const PARCEL_INSTRUCTIONS_LIMIT = 500;
const PICKUP_LABEL = 'Pickup access: ';
const DROPOFF_LABEL = 'Drop-off access: ';
const DELIVERY_LABEL = 'Delivery instructions: ';

function fieldLimit(label: string, otherFields: { label: string; value: string }[]): number {
  const present = otherFields.map(field => ({ ...field, value: field.value.trim() })).filter(field => field.value);
  const usedByOtherFields = present.reduce((sum, field) => sum + field.label.length + field.value.length, 0);
  return Math.max(0, PARCEL_INSTRUCTIONS_LIMIT - label.length - usedByOtherFields - present.length);
}

export function getPickupInstructionsLimit(dropoffInstructions = '', deliveryInstructions = ''): number {
  return fieldLimit(PICKUP_LABEL, [
    { label: DROPOFF_LABEL, value: dropoffInstructions },
    { label: DELIVERY_LABEL, value: deliveryInstructions },
  ]);
}

export function getDropoffInstructionsLimit(pickupInstructions = '', deliveryInstructions = ''): number {
  return fieldLimit(DROPOFF_LABEL, [
    { label: PICKUP_LABEL, value: pickupInstructions },
    { label: DELIVERY_LABEL, value: deliveryInstructions },
  ]);
}

export function getDeliveryInstructionsLimit(pickupInstructions = '', dropoffInstructions = ''): number {
  return fieldLimit(DELIVERY_LABEL, [
    { label: PICKUP_LABEL, value: pickupInstructions },
    { label: DROPOFF_LABEL, value: dropoffInstructions },
  ]);
}

export function buildParcelInstructions(pickupInstructions: string, deliveryInstructions: string, handoverInstructions = ''): string {
  const pickup = pickupInstructions.trim();
  const dropoff = deliveryInstructions.trim();
  const handover = handoverInstructions.trim();
  return [
    pickup ? `${PICKUP_LABEL}${pickup}` : '',
    dropoff ? `${DROPOFF_LABEL}${dropoff}` : '',
    handover ? `${DELIVERY_LABEL}${handover}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
