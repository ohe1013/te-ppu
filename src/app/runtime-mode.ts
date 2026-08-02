export type RuntimeMode = 'browser' | 'apps-in-toss';

export function resolveRuntimeMode(value: string): RuntimeMode {
  if (value === 'browser' || value === 'apps-in-toss') return value;
  throw new Error(`Unsupported runtime mode: ${value}`);
}
