type ProgressStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'delivered' | 'completed' | 'cancelled';

export function getBookingProgress(status: ProgressStatus): number {
  return ({ pending: 15, accepted: 35, preparing: 55, ready: 65, transit: 82, delivered: 100, completed: 100, cancelled: 0 })[status];
}
