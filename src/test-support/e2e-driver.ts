import type { MatchOutcome, MatchResult } from '../app/app-route';
import type { GameCommand } from '../core/index';
import type { EncounterIndex } from '../progression/index';
import type { Floor } from '../progression/index';

export type E2ELifecycleState = 'hidden' | 'visible';
export type E2ECloseMode = 'resolve' | 'hang';
export type E2EProgressSaveMode = 'persist' | 'fail';

export interface E2EMatchMetadata {
  readonly floor: Floor;
  readonly encounterIndex: EncounterIndex;
  readonly wins: 0 | 1 | 2;
}

export interface TePpuE2EDriver {
  readonly dispatchedCommands: readonly GameCommand[];
  readonly closeCount: number;
  readonly currentMatch: E2EMatchMetadata | null;
  finish(result: MatchResult, durationTicks?: number): Promise<void>;
  setCloseMode(mode: E2ECloseMode): void;
  setLifecycle(state: E2ELifecycleState): void;
  setMatchPaused(paused: boolean): void;
  setProgressSaveMode(mode: E2EProgressSaveMode): void;
}

declare global {
  interface Window {
    __TE_PPU_E2E__: TePpuE2EDriver;
  }
}

type FinishHandler = (outcome: MatchOutcome) => void | Promise<void>;
type PauseHandler = (paused: boolean) => void;

interface FinishBinding {
  readonly handler: FinishHandler;
  readonly metadata: E2EMatchMetadata | null;
}

export class E2EDriverController {
  readonly #commands: GameCommand[] = [];
  #closeCount = 0;
  #closeMode: E2ECloseMode = 'resolve';
  #finishBinding: FinishBinding | null = null;
  #pauseHandler: PauseHandler | null = null;
  #progressSaveMode: E2EProgressSaveMode = 'persist';
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
      get currentMatch() {
        return controller.#finishBinding?.metadata ?? null;
      },
      get dispatchedCommands() {
        return controller.#commands.map((command) => ({ ...command }));
      },
      async finish(result, durationTicks = 600) {
        const binding = controller.#finishBinding;
        if (binding === null) {
          throw new Error('No E2E match is currently active.');
        }
        await binding.handler({ result, durationTicks });
      },
      setCloseMode(mode) {
        controller.#setCloseMode(mode);
      },
      setLifecycle(state) {
        controller.#setLifecycle(state);
      },
      setMatchPaused(paused) {
        const handler = controller.#pauseHandler;
        if (handler === null) throw new Error('No E2E match loop is currently active.');
        handler(paused);
      },
      setProgressSaveMode(mode) {
        controller.#setProgressSaveMode(mode);
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
      this.#finishBinding = null;
      this.#pauseHandler = null;
      this.#installedWindow = null;
      this.#previousVisibilityDescriptor = undefined;
    };
  }

  bindFinish(
    handler: FinishHandler,
    metadata: E2EMatchMetadata | null = null,
  ): () => void {
    this.#finishBinding = { handler, metadata };
    return () => {
      if (this.#finishBinding?.handler === handler) this.#finishBinding = null;
    };
  }

  bindPause(handler: PauseHandler): () => void {
    this.#pauseHandler = handler;
    return () => {
      if (this.#pauseHandler === handler) this.#pauseHandler = null;
    };
  }

  recordCommand(command: GameCommand): void {
    this.#commands.push({ ...command });
  }

  recordClose(): void {
    this.#closeCount += 1;
  }

  shouldFailProgressSave(): boolean {
    return this.#progressSaveMode === 'fail';
  }

  close(): Promise<void> {
    this.recordClose();
    if (this.#closeMode === 'hang') return new Promise<void>(() => undefined);
    return Promise.resolve();
  }

  #setCloseMode(mode: E2ECloseMode): void {
    if (mode !== 'resolve' && mode !== 'hang') {
      throw new RangeError(`Unsupported E2E close mode: ${String(mode)}`);
    }
    this.#closeMode = mode;
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

  #setProgressSaveMode(mode: E2EProgressSaveMode): void {
    if (mode !== 'persist' && mode !== 'fail') {
      throw new RangeError(`Unsupported E2E progress-save mode: ${String(mode)}`);
    }
    this.#progressSaveMode = mode;
  }
}
