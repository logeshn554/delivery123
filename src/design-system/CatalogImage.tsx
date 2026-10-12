import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function CatalogImage({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <div className={`${className} catalog-image-fallback`} aria-hidden="true">{fallback}</div>;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
