export type RuntimeMode = 'browser' | 'apps-in-toss' | 'android';

export function resolveRuntimeMode(value: string): RuntimeMode {
  if (value === 'browser' || value === 'apps-in-toss' || value === 'android') return value;
  throw new Error(`Unsupported runtime mode: ${value}`);
}
