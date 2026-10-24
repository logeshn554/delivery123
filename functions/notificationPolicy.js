const { createHash } = require('node:crypto');

function notificationId(eventId, uid) {
  return createHash('sha256').update(`${eventId}\0${uid}`).digest('hex');
}

async function claimNotification(db, ref, record) {
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) return false;
    transaction.create(ref, record);
    return true;
  });
}

function bookingNotificationContent(booking, previous) {
  const service = ({ food: 'Food order', grocery: 'Grocery order', ride: 'Ride', parcel: 'Parcel', takeover: 'Driver hire', transport: 'Vehicle transport' })[booking.serviceType] || 'Order';
  if (!previous) return { type: 'order_confirmed', title: `${service} confirmed`, body: `Your ${service.toLowerCase()} is confirmed.` };
  if (booking.paymentStatus !== previous.paymentStatus) {
    const payment = ({ paid: 'Payment confirmed', refund_pending: 'Refund processing', refunded: 'Refund completed', refund_required: 'Refund needs review', failed: 'Payment failed' })[booking.paymentStatus];
    if (payment) return { type: `payment_${booking.paymentStatus}`, title: payment, body: `${service} ${booking.bookingId}: ${payment.toLowerCase()}.` };
  }
  if (booking.driverId && booking.driverId !== previous.driverId) return { type: 'driver_assigned', title: 'Delivery partner assigned', body: `A delivery partner has been assigned to ${service.toLowerCase()} ${booking.bookingId}.` };
  if (booking.details?.pickupTimeReview?.status !== previous.details?.pickupTimeReview?.status && booking.details?.pickupTimeReview?.status) {
    const confirmed = booking.details.pickupTimeReview.status === 'confirmed';
    return { type: `pickup_time_${booking.details.pickupTimeReview.status}`, title: confirmed ? 'Pickup time confirmed' : 'Pickup time declined', body: `${service} ${booking.bookingId}: operations ${confirmed ? 'confirmed' : 'declined'} the requested pickup time.` };
  }
  if (booking.pickupAddress !== previous.pickupAddress || booking.dropAddress !== previous.dropAddress) return { type: 'route_changed', title: `${service} route updated`, body: `The pickup or destination for ${service.toLowerCase()} ${booking.bookingId} changed. Review the updated order details.` };
  if (booking.exception?.status !== previous.exception?.status && booking.exception?.status) return { type: `booking_issue_${booking.exception.status}`, title: booking.exception.status === 'open' ? 'Order needs attention' : 'Order issue updated', body: `There is an update about ${service.toLowerCase()} ${booking.bookingId}.` };
  if (booking.status !== previous.status) {
    const labels = { accepted: 'accepted', preparing: 'being prepared', ready: 'ready for pickup', transit: 'on the way', delivered: 'delivered', completed: 'completed', cancelled: 'cancelled' };
    return { type: `booking_${booking.status}`, title: `${service} update`, body: `${service} ${booking.bookingId} is ${labels[booking.status] || booking.status.replaceAll('_', ' ')}.` };
  }
  if (booking.preparation?.revision !== previous.preparation?.revision || booking.picking?.revision !== previous.picking?.revision) return { type: 'order_preparation', title: `${service} update`, body: `${service} ${booking.bookingId} has a preparation update.` };
  return { type: 'order_update', title: `${service} update`, body: `There is a new update for ${service.toLowerCase()} ${booking.bookingId}.` };
}

module.exports = { notificationId, claimNotification, bookingNotificationContent };
