import { describe, expect, it } from 'vitest';
import { OWL_ENCOUNTER } from './owl';

describe('hidden owl encounter', () => {
  it('identifies the mascot as the tower architect', () => {
    expect(OWL_ENCOUNTER).toMatchObject({
      characterId: 'owl-companion',
      title: '탑의 설계자',
    });
    expect(OWL_ENCOUNTER.intro).toContain('미끼');
  });
});
