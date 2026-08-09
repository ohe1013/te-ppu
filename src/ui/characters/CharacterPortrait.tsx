import type { LoadedImageRef, PortraitState } from '../../assets';
import { AssetImage } from '../match/AssetImage';

export interface CharacterPortraitProps {
  readonly image?: LoadedImageRef;
  readonly alt: string;
  readonly state: PortraitState;
  readonly className?: string;
}

export function CharacterPortrait({ alt, className, image, state }: CharacterPortraitProps) {
  const classes = ['character-portrait', className].filter(Boolean).join(' ');
  return (
    <span
      className={classes}
      data-portrait-state={state}
      data-testid="character-portrait"
    >
      <AssetImage alt={alt} className="character-portrait__image" url={image?.url} />
    </span>
  );
}
