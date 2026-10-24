export type ParcelBookingStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'arrived_at_destination' | 'delivered' | 'completed' | 'cancelled';

export interface ParcelTrackingPresentation {
  stage: number;
  title: string;
  steps: readonly [string, string, string, string];
  terminal: boolean;
}

export function getParcelTrackingPresentation(status: ParcelBookingStatus): ParcelTrackingPresentation {
  const steps = ['Shipment created', 'Partner assigned', 'In transit', 'Delivered'] as const;
  if (status === 'cancelled') return { stage: 0, title: 'Shipment cancelled', steps, terminal: true };
  if (status === 'arrived_at_destination') return { stage: 2, title: 'Shipment status needs review', steps, terminal: false };
  if (status === 'delivered' || status === 'completed') return { stage: 3, title: 'Shipment delivered', steps, terminal: true };
  if (status === 'transit') return { stage: 2, title: 'Your parcel is in transit', steps, terminal: false };
  if (status === 'accepted' || status === 'preparing' || status === 'ready') return { stage: 1, title: 'A delivery partner has accepted', steps, terminal: false };
  return { stage: 0, title: 'Waiting for a delivery partner', steps, terminal: false };
}
