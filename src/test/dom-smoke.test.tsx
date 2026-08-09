// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

describe('DOM test environment', () => {
  it('provides document and DOM matchers for UI tests', () => {
    const element = document.createElement('main');
    document.body.append(element);

    try {
      expect(element).toBeInTheDocument();
    } finally {
      element.remove();
    }
  });
});
