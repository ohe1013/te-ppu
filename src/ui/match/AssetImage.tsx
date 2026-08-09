import { useState } from 'react';

export interface AssetImageProps {
  readonly alt: string;
  readonly className?: string;
  readonly url?: string;
}

function classNames(...values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined && value !== '').join(' ');
}

function usableUrl(url: string | undefined): string | undefined {
  return url === undefined || url === '' ? undefined : url;
}

export function AssetImage({ alt, className, url }: AssetImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = usableUrl(url);
  if (imageUrl === undefined || failedUrl === imageUrl) {
    return (
      <span
        aria-label={alt}
        className={classNames('asset-image', 'asset-image--fallback', className)}
        role="img"
      >
        <span aria-hidden="true" className="asset-image__fallback-label">
          {alt.slice(0, 1)}
        </span>
      </span>
    );
  }
  return (
    <img
      alt={alt}
      className={classNames('asset-image', className)}
      onError={() => setFailedUrl(imageUrl)}
      src={imageUrl}
    />
  );
}
