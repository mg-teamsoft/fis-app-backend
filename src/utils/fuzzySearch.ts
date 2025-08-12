import Fuse from 'fuse.js';

export function fuzzyFind(text: string, fuzzyKeys: string[], threshold: number): string | null {
  const fuse = new Fuse(fuzzyKeys, {
    includeScore: true,
    threshold: threshold,
    minMatchCharLength: 3,
  });

  const tokens = text.toLowerCase().split(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/).filter(Boolean);

  for (const token of tokens) {
    if (token.length < 3) continue; // skip short words

    const result = fuse.search(token);
    if (result.length > 0 && result[0].score! < 0.3) {
      return result[0].item;
    }
  }

  return null;
}

export function fuzzySearchInLines(line: string, keys: string[], threshold = 0.4): string | null {
  const fuse = new Fuse(
    keys.map(k => ({ key: k })),
    {
      keys: ['key'],
      includeScore: true,
      threshold,
    }
  );

  const result = fuse.search(line.toLowerCase());
  return result.length > 0 && result[0].score !== undefined && result[0].score < threshold
    ? result[0].item.key
    : null;
}