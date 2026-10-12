interface TripBundleScreenProps {
  onBack: () => void;
  onOpenTracking: (bundleId: string) => void;
}

/** Booking stays unavailable until catalog, routing and partner fulfillment acceptance. */
export function TripBundleScreen({ onBack }: TripBundleScreenProps) {
  return <section className="allgo-unavailable">
    <h1 className="text-xl font-bold">Combined journeys are not available yet</h1>
    <p>Book individual services while combined partner fulfillment and route tracking are being completed.</p>
    <button type="button" onClick={onBack}>Back to services</button>
  </section>;
}
