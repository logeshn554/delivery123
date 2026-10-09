function publicOffer(id, booking) {
  return {
    bookingId: id, serviceType: booking.serviceType, status: booking.status,
    paymentStatus: booking.paymentStatus, price: booking.price, driverId: null,
    createdAt: booking.createdAt, customerId: '', customerName: '',
    pickupAddress: 'Pickup details available after acceptance',
    dropAddress: 'Delivery details available after acceptance',
    details: {
      ...(booking.details?.vehicleType ? { vehicleType: booking.details.vehicleType } : {}),
      ...(booking.details?.transportVehicleType ? { transportVehicleType: booking.details.transportVehicleType } : {}),
      ...(Number.isFinite(booking.details?.estimatedKm) ? { estimatedKm: booking.details.estimatedKm } : {})
    }
  };
}
module.exports = { publicOffer };
