export const bookingExceptionKinds = (serviceType: string, status: string) => {
  const kinds = ['delay', 'damage', 'lost', 'safety'];
  if (['accepted', 'preparing', 'ready'].includes(status)) kinds.push('failed_pickup');
  if (status === 'transit') kinds.push('failed_delivery');
  if (['food', 'grocery'].includes(serviceType)) kinds.push('merchant_unavailable');
  return kinds;
};
