type ProgressStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'arrived_at_destination' | 'delivered' | 'completed' | 'cancelled';

export function getBookingProgress(status: ProgressStatus): number {
  return ({ pending: 15, accepted: 35, preparing: 55, ready: 65, transit: 82, arrived_at_destination: 92, delivered: 100, completed: 100, cancelled: 0 })[status];
}
