import type { MatchResult } from '../app/app-route';
import type { GameCommand } from '../core/index';

export type E2ELifecycleState = 'hidden' | 'visible';

export interface TePpuE2EDriver {
  readonly dispatchedCommands: readonly GameCommand[];
  readonly closeCount: number;
  finish(result: MatchResult): Promise<void>;
  setLifecycle(state: E2ELifecycleState): void;
}

declare global {
  interface Window {
    __TE_PPU_E2E__: TePpuE2EDriver;
  }
}

type FinishHandler = (result: MatchResult) => void | Promise<void>;

export class E2EDriverController {
  readonly #commands: GameCommand[] = [];
  #closeCount = 0;
  #finishHandler: FinishHandler | null = null;
  #visibilityState: E2ELifecycleState = 'visible';
  #installedWindow: Window | null = null;
  #previousVisibilityDescriptor: PropertyDescriptor | undefined;

  readonly driver: TePpuE2EDriver;

  constructor() {
    const controller = this;
    this.driver = {
      get closeCount() {
        return controller.#closeCount;
      },
      get dispatchedCommands() {
        return controller.#commands.map((command) => ({ ...command }));
      },
      async finish(result) {
        const handler = controller.#finishHandler;
        if (handler === null) {
          throw new Error('No E2E match is currently active.');
        }
        await handler(result);
      },
      setLifecycle(state) {
        controller.#setLifecycle(state);
      },
    };
  }

  install(target: Window = window): () => void {
    if (this.#installedWindow !== null) {
      throw new Error('The E2E driver is already installed.');
    }
    this.#installedWindow = target;
    this.#previousVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      target.document,
      'visibilityState',
    );
    Object.defineProperty(target.document, 'visibilityState', {
      configurable: true,
      get: () => this.#visibilityState,
    });
    target.__TE_PPU_E2E__ = this.driver;

    return () => {
      if (this.#installedWindow !== target) return;
      Reflect.deleteProperty(target, '__TE_PPU_E2E__');
      if (this.#previousVisibilityDescriptor === undefined) {
        Reflect.deleteProperty(target.document, 'visibilityState');
      } else {
        Object.defineProperty(
          target.document,
          'visibilityState',
          this.#previousVisibilityDescriptor,
        );
      }
      this.#finishHandler = null;
      this.#installedWindow = null;
      this.#previousVisibilityDescriptor = undefined;
    };
  }

  bindFinish(handler: FinishHandler): () => void {
    this.#finishHandler = handler;
    return () => {
      if (this.#finishHandler === handler) this.#finishHandler = null;
    };
  }

  recordCommand(command: GameCommand): void {
    this.#commands.push({ ...command });
  }

  recordClose(): void {
    this.#closeCount += 1;
  }

  #setLifecycle(state: E2ELifecycleState): void {
    if (state !== 'hidden' && state !== 'visible') {
      throw new RangeError(`Unsupported E2E lifecycle state: ${String(state)}`);
    }
    this.#visibilityState = state;
    const document = this.#installedWindow?.document;
    if (document === undefined) {
      throw new Error('The E2E driver is not installed.');
    }
    document.dispatchEvent(new CustomEvent('te-ppu:e2e-lifecycle', {
      detail: { state },
    }));
    document.dispatchEvent(new Event('visibilitychange'));
  }
}
