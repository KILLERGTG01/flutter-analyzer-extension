export type CleanResult = { kind: 'clean' };

export type ReviewResult = {
  kind: 'issue';
  bugName: string;
  diagnosticCode: string;
  context: string;
  affectedCode: string;
  fix: string;
};

export type ParsedReview = CleanResult | ReviewResult[];

const CLEAN: CleanResult = Object.freeze({ kind: 'clean' });

export function parseReview(raw: string): ParsedReview {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.startsWith('FLUTTER REVIEW: No issues detected.')) {
    return CLEAN;
  }

  // Split at each FLUTTER BUG: heading (keep the heading in each block)
  const blocks = trimmed
    .split(/(?=^FLUTTER BUG:)/m)
    .filter((b) => b.trim().startsWith('FLUTTER BUG:'));

  if (blocks.length === 0) {
    return CLEAN;
  }

  const results: ReviewResult[] = [];

  for (const block of blocks) {
    const bugMatch = block.match(/^FLUTTER BUG:\s*(.+?)\s*\[([^\]]+)\]/m);
    if (!bugMatch) {
      continue;
    }

    const contextMatch = block.match(/^CONTEXT:\s*(.+)$/m);
    const affectedCodeMatch = block.match(/AFFECTED CODE:\s*```dart\s*([\s\S]*?)```/);
    const fixMatch = block.match(/^FIX:\s*([\s\S]*)$/m);

    if (!contextMatch || !affectedCodeMatch || !fixMatch) {
      continue;
    }

    results.push({
      kind: 'issue',
      bugName: bugMatch[1].trim(),
      diagnosticCode: bugMatch[2].trim(),
      context: contextMatch[1].trim(),
      affectedCode: affectedCodeMatch[1].trim(),
      fix: fixMatch[1].trim(),
    });
  }

  if (results.length === 0) {
    return CLEAN;
  }

  return results;
}
