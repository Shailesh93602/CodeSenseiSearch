import {
  chunkPlainText,
  estimateTokenCount,
  generateContentHash,
  isCodeLanguage,
} from '../chunking-helpers';

describe('chunking-helpers', () => {
  describe('isCodeLanguage', () => {
    it.each([
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'rust',
      'c',
      'cpp',
      'csharp',
      'php',
      'ruby',
      'scala',
      'kotlin',
      'swift',
    ])('recognises %s', (lang) => {
      expect(isCodeLanguage(lang)).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isCodeLanguage('TypeScript')).toBe(true);
      expect(isCodeLanguage('PYTHON')).toBe(true);
    });

    it.each(['markdown', 'text', 'json', 'yaml', '', 'haskell'])(
      'rejects %s',
      (lang) => {
        expect(isCodeLanguage(lang)).toBe(false);
      },
    );
  });

  describe('generateContentHash', () => {
    it('returns a hex string', () => {
      expect(generateContentHash('hello')).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic', () => {
      expect(generateContentHash('hello')).toBe(generateContentHash('hello'));
    });

    it('produces different hashes for different content', () => {
      expect(generateContentHash('hello')).not.toBe(
        generateContentHash('world'),
      );
    });

    it('handles empty input', () => {
      expect(generateContentHash('')).toBe('0');
    });
  });

  describe('estimateTokenCount', () => {
    it('returns ~length/4 (rounded up)', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount('abc')).toBe(1);
      expect(estimateTokenCount('abcd')).toBe(1);
      expect(estimateTokenCount('abcde')).toBe(2);
      expect(estimateTokenCount('a'.repeat(400))).toBe(100);
    });
  });

  describe('chunkPlainText', () => {
    it('returns empty array for empty input', () => {
      expect(chunkPlainText('', 100, 20)).toEqual([]);
    });

    it('returns one chunk when content fits in chunkSize', () => {
      const chunks = chunkPlainText('short text', 100, 20);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('short text');
      expect(chunks[0].startPosition).toBe(0);
    });

    it('splits long content into multiple overlapping chunks', () => {
      const text = 'a long paragraph repeated many times. '.repeat(60);
      const chunks = chunkPlainText(text, 200, 40);

      expect(chunks.length).toBeGreaterThan(5);
      // No chunk exceeds chunkSize + slack
      for (const c of chunks) {
        expect(c.text.length).toBeLessThanOrEqual(220);
      }
    });

    it('snaps to word boundaries when the last space is in the upper 20% of the chunk', () => {
      // chunkSize=100, snap threshold = 80. Put the last space at
      // position ~95 so it falls inside the snap zone.
      const head = 'a'.repeat(90); // 90 chars, no spaces
      const text = head + ' tail-after-space ' + 'b'.repeat(50);
      const chunks = chunkPlainText(text, 100, 20);

      // First chunk should end at the space (position 90), not at the
      // raw 100-char cut. So its text shouldn't include the b's.
      expect(chunks[0].text).toBe(head);
    });

    it('always advances at least one char (no infinite loop on overlap-sized tail)', () => {
      // The original bug: chunkText.length - overlap === 0 → infinite loop.
      // Reproduce by tuning chunkSize/overlap so the tail trips that path.
      const text = 'a'.repeat(2280); // 2280 chars; 200/40 produces a 40-char tail
      const start = Date.now();
      const chunks = chunkPlainText(text, 200, 40);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Would have been ∞ before the fix
      expect(chunks.length).toBeGreaterThan(0);
      // Last chunk should end at content.length
      expect(chunks.at(-1)!.endPosition).toBeLessThanOrEqual(text.length);
    });
  });
});
