export type InputReset = () => void;

export class InputResetBus {
  readonly #resets = new Set<InputReset>();

  register(reset: InputReset): () => void {
    this.#resets.add(reset);
    return () => {
      this.#resets.delete(reset);
    };
  }

  resetAll(): void {
    for (const reset of [...this.#resets]) reset();
  }
}
