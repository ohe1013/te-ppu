import type { GameCommand } from '../../core/index';

const NEUTRAL_RATIO = 0.2;
const HARD_DROP_RATIO = 0.8;
const INITIAL_REPEAT_MS = 160;
const REPEAT_MS = 50;

export type CommandSink = (command: GameCommand) => void;

export class JoystickController {
  readonly #onCommand: CommandSink;
  #horizontalDirection: -1 | 1 | null = null;
  #repeatDelay: ReturnType<typeof setTimeout> | null = null;
  #repeatInterval: ReturnType<typeof setInterval> | null = null;
  #softDropActive = false;
  #hardDropArmed = true;

  constructor(onCommand: CommandSink) {
    this.#onCommand = onCommand;
  }

  update(dx: number, dy: number, radius: number): void {
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
      this.release();
      return;
    }

    if (distance <= radius * NEUTRAL_RATIO) {
      this.#enterNeutral();
      return;
    }

    if (Math.abs(dx) >= Math.abs(dy)) {
      this.#setSoftDrop(false);
      this.#setHorizontal(dx < 0 ? -1 : 1);
      return;
    }

    this.#clearHorizontal();
    if (dy > 0) {
      this.#setSoftDrop(true);
      return;
    }

    this.#setSoftDrop(false);
    if (distance > radius * HARD_DROP_RATIO && this.#hardDropArmed) {
      this.#hardDropArmed = false;
      this.#onCommand({ type: 'hard-drop' });
    }
  }

  release(): void {
    this.#clearHorizontal();
    this.#setSoftDrop(false);
    this.#hardDropArmed = true;
  }

  #enterNeutral(): void {
    this.#clearHorizontal();
    this.#setSoftDrop(false);
    this.#hardDropArmed = true;
  }

  #setHorizontal(direction: -1 | 1): void {
    if (this.#horizontalDirection === direction) return;
    this.#clearHorizontal();
    this.#horizontalDirection = direction;
    this.#repeatDelay = setTimeout(() => {
      this.#repeatDelay = null;
      if (this.#horizontalDirection !== direction) return;
      this.#onCommand({ type: 'move', dx: direction });
      this.#repeatInterval = setInterval(() => {
        if (this.#horizontalDirection === direction) {
          this.#onCommand({ type: 'move', dx: direction });
        }
      }, REPEAT_MS);
    }, INITIAL_REPEAT_MS);
    this.#onCommand({ type: 'move', dx: direction });
  }

  #clearHorizontal(): void {
    this.#horizontalDirection = null;
    if (this.#repeatDelay !== null) clearTimeout(this.#repeatDelay);
    if (this.#repeatInterval !== null) clearInterval(this.#repeatInterval);
    this.#repeatDelay = null;
    this.#repeatInterval = null;
  }

  #setSoftDrop(active: boolean): void {
    if (this.#softDropActive === active) return;
    this.#softDropActive = active;
    this.#onCommand({ type: 'soft-drop', active });
  }
}
