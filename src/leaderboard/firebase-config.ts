export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

const CONFIG_KEYS = [
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_APP_ID', 'appId'],
] as const;

export function parseFirebaseWebConfig(
  env: Record<string, string | boolean | undefined>,
): FirebaseWebConfig | null {
  const values = CONFIG_KEYS.map(([envKey, configKey]) => {
    const value = env[envKey];
    return [configKey, typeof value === 'string' ? value.trim() : ''] as const;
  });
  const configuredCount = values.filter(([, value]) => value.length > 0).length;

  if (configuredCount === 0) return null;
  if (configuredCount !== CONFIG_KEYS.length) {
    throw new Error('Partial Firebase configuration: all four VITE_FIREBASE_* values are required.');
  }

  return Object.fromEntries(values) as unknown as FirebaseWebConfig;
}
