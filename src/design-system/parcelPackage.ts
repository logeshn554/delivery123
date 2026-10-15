export const SUPPORTED_PARCEL_TYPES = ['Documents', 'Box', 'Electronics', 'Others'] as const;
export type SupportedParcelType = typeof SUPPORTED_PARCEL_TYPES[number];

export function parcelTypeRequiresDimensions(type: string): boolean {
  return type !== 'Documents';
}
