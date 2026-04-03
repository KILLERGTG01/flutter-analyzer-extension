export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function findMatchingLine(documentLines: string[], snippet: string): number {
  const snippetLines = snippet
    .split('\n')
    .map(normalizeWhitespace)
    .filter(Boolean);

  if (snippetLines.length === 0 || documentLines.length === 0) {
    return 0;
  }

  const firstSnippetLine = snippetLines[0];

  for (let i = 0; i < documentLines.length; i++) {
    if (normalizeWhitespace(documentLines[i]).includes(firstSnippetLine)) {
      return i;
    }
  }

  return 0;
}
