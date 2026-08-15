import { useEffect, useMemo, useState } from 'react';
import type { LoadedImageRef } from '../../assets';

export interface ScreenBackdropProps {
  readonly image?: LoadedImageRef;
  readonly className?: string;
}

export function ScreenBackdrop({ className, image }: ScreenBackdropProps) {
  const key = image === undefined ? null : `${image.url}:${image.generation}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    setFailedKey(null);
  }, [key]);
  const visible = useMemo(() => image !== undefined && image.url !== '' && failedKey !== key, [failedKey, image, key]);
  if (!visible || image === undefined) return null;
  return (
    <img
      aria-hidden="true"
      className={['screen-backdrop', className].filter(Boolean).join(' ')}
      onError={() => setFailedKey(key)}
      src={image.url}
    />
  );
}
