import { useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { GameCommand } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import { AssetIcon } from './AssetIcon';
import './controls.css';

export interface RotateButtonProps {
  readonly onCommand: (command: GameCommand) => void;
  readonly icon?: LoadedImageRef;
}

type ActivationKey = 'Enter' | ' ';

function isActivationKey(key: string): key is ActivationKey {
  return key === 'Enter' || key === ' ';
}

export function RotateButton({ icon, onCommand }: RotateButtonProps) {
  const heldActivationKeys = useRef(new Set<ActivationKey>());
  const rotate = () => onCommand({ type: 'rotate-clockwise' });

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    rotate();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    rotate();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isActivationKey(event.key)) return;
    if (event.repeat || heldActivationKeys.current.has(event.key)) {
      event.preventDefault();
      return;
    }
    heldActivationKeys.current.add(event.key);
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isActivationKey(event.key)) return;
    heldActivationKeys.current.delete(event.key);
  };

  const handleBlur = () => {
    heldActivationKeys.current.clear();
  };

  return (
    <button
      aria-label="시계 방향 회전"
      className="rotate-control"
      type="button"
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerDown={handlePointerDown}
    >
      <AssetIcon className="asset-icon" fallback="↻" image={icon} />
    </button>
  );
}
