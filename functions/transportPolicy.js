function validateTransport(details) {
  if (details.ownershipConfirmed !== true) throw new Error('Confirm that you own the vehicle or are authorised by its owner.');
  if (!Number.isFinite(details.vehicleWeightKg) || details.vehicleWeightKg <= 0 || details.vehicleWeightKg > 10000) throw new Error('Provide the vehicle weight in kilograms.');
  const dimensions = details.vehicleDimensions;
  if (!dimensions || ['lengthCm','widthCm','heightCm'].some(key => !Number.isFinite(dimensions[key]) || dimensions[key] <= 0 || dimensions[key] > 1500)) throw new Error('Provide valid vehicle dimensions in centimetres.');
  return { ownershipConfirmed: true, vehicleWeightKg: details.vehicleWeightKg, vehicleDimensions: { lengthCm: dimensions.lengthCm, widthCm: dimensions.widthCm, heightCm: dimensions.heightCm }, vehicleCondition: typeof details.vehicleCondition === 'string' ? details.vehicleCondition.trim().slice(0, 1000) : '' };
}
function carrierSuitable(capabilities, details) {
  return capabilities?.approved === true && Array.isArray(capabilities.supportedVehicleTypes) && capabilities.supportedVehicleTypes.includes(details.transportVehicleType) && Number.isSafeInteger(capabilities.vehicleCapacity) && capabilities.vehicleCapacity >= 1 && typeof capabilities.equipmentType === 'string' && capabilities.equipmentType.trim().length > 0 && Number.isFinite(capabilities.maxWeightKg) && capabilities.maxWeightKg >= details.vehicleWeightKg && ['lengthCm','widthCm','heightCm'].every(key => Number.isFinite(capabilities.maxDimensions?.[key]) && capabilities.maxDimensions[key] >= details.vehicleDimensions?.[key]);
}
module.exports = { validateTransport, carrierSuitable };
