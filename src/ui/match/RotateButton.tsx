import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameCommand } from '../../core/index';
import './controls.css';

export interface RotateButtonProps {
  readonly onCommand: (command: GameCommand) => void;
}

export function RotateButton({ onCommand }: RotateButtonProps) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onCommand({ type: 'rotate-clockwise' });
  };

  return (
    <button
      aria-label="시계 방향 회전"
      className="rotate-control"
      type="button"
      onPointerDown={handlePointerDown}
    >
      <span aria-hidden="true">↻</span>
    </button>
  );
}
