import { useEffect, useState } from 'react';
import type { LoadedImageRef } from '../../assets';

export interface AssetIconProps {
  readonly fallback: string;
  readonly image?: LoadedImageRef;
  readonly className?: string;
}

export function AssetIcon({ className, fallback, image }: AssetIconProps) {
  const key = image === undefined ? null : `${image.url}:${image.generation}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => setFailedKey(null), [key]);
  if (image !== undefined && image.url !== '' && failedKey !== key) {
    return <img aria-hidden="true" className={className} onError={() => setFailedKey(key)} src={image.url} />;
  }
  return <span aria-hidden="true" className={className}>{fallback}</span>;
}
