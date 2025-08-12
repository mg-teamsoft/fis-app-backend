interface Vertex {
  x: number;
  y: number;
}

interface BoundingPoly {
  vertices: Vertex[];
}

interface TextAnnotation {
  description: string;
  boundingPoly: BoundingPoly;
}

export function extractLinesFromAnnotations(annotations: TextAnnotation[]): string[] {
  const lines: Record<number, [number, number, [number, string][]]> = {};
  const results: string[] = [];

  for (const text of annotations.slice(1)) {
    const topX = text.boundingPoly.vertices[0].x;
    const topY = text.boundingPoly.vertices[0].y;
    const bottomY = text.boundingPoly.vertices[3].y;

    let matched = false;

    for (const key in lines) {
      const [minY, maxY, words] = lines[+key];
      if (topY < maxY) {
        words.push([topX, text.description]);
        matched = true;
        break;
      }
    }

    if (!matched) {
      lines[topY] = [topY, bottomY, [[topX, text.description]]];
    }
  }

  const sortedLineKeys = Object.keys(lines).map(Number).sort((a, b) => a - b);

  for (const key of sortedLineKeys) {
    const [, , words] = lines[key];
    const sortedWords = words.sort((a, b) => a[0] - b[0]);
    results.push(sortedWords.map(([, word]) => word).join(' '));
  }

  return results;
}