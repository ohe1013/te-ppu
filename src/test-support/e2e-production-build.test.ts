import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

async function filesBelow(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else files.push(path);
  }
  return files;
}

describe('production E2E-driver gate', () => {
  it.each(['browser', 'apps'] as const)(
    'omits the driver global and implementation from the %s build',
    async (mode) => {
      const outputRoot = await mkdtemp(join(tmpdir(), `te-ppu-${mode}-`));
      temporaryDirectories.push(outputRoot);
      const outDir = join(outputRoot, 'dist');
      await build({
        configFile: resolve('vite.config.ts'),
        mode,
        build: { emptyOutDir: true, outDir },
        logLevel: 'silent',
      });

      const files = await filesBelow(outDir);
      const text = (await Promise.all(files.map(async (path) => (
        `${path}\n${await readFile(path, 'utf8')}`
      )))).join('\n');

      expect(text).not.toContain('__TE_PPU_E2E__');
      expect(text).not.toContain('No E2E match is currently active.');
      expect(text).not.toContain('e2e-wiring');
    },
  );
});
