import type { ArcadeDirection } from './grid-navigation';

export interface ArcadeDirectionPadProps {
  readonly onDirection: (direction: ArcadeDirection) => void;
}

const DIRECTIONS = [
  { direction: 'up', label: '위', symbol: '▲' },
  { direction: 'left', label: '왼쪽', symbol: '◀' },
  { direction: 'down', label: '아래', symbol: '▼' },
  { direction: 'right', label: '오른쪽', symbol: '▶' },
] as const;

export function ArcadeDirectionPad({ onDirection }: ArcadeDirectionPadProps) {
  return (
    <div aria-label="방향 패드" className="arcade-direction-pad" role="group">
      {DIRECTIONS.map(({ direction, label, symbol }) => (
        <button
          aria-label={label}
          className={`arcade-direction-pad__button arcade-direction-pad__button--${direction}`}
          key={direction}
          onClick={() => onDirection(direction)}
          type="button"
        >
          <span aria-hidden="true">{symbol}</span>
        </button>
      ))}
    </div>
  );
}
