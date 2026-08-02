import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { GameCommand } from '../../core/index';
import './controls.css';

export interface RotateButtonProps {
  readonly onCommand: (command: GameCommand) => void;
}

export function RotateButton({ onCommand }: RotateButtonProps) {
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

  return (
    <button
      aria-label="시계 방향 회전"
      className="rotate-control"
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
    >
      <span aria-hidden="true">↻</span>
    </button>
  );
}
