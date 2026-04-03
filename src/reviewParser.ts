export type CleanResult = { kind: 'clean' };

export type ReviewResult = {
  kind: 'issue';
  bugName: string;
  diagnosticCode: string;
  context: string;
  affectedCode: string;
  fix: string;
};

export type ParsedReview = CleanResult | ReviewResult;

const CLEAN: CleanResult = Object.freeze({ kind: 'clean' });

export function parseReview(raw: string): ParsedReview {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.startsWith('FLUTTER REVIEW: No issues detected.')) {
    return CLEAN;
  }

  const bugMatch = trimmed.match(/^FLUTTER BUG:\s*(.+?)\s*\[([^\]]+)\]/m);
  if (!bugMatch) {
    return CLEAN;
  }

  const contextMatch = trimmed.match(/^CONTEXT:\s*(.+)$/m);
  const affectedCodeMatch = trimmed.match(/AFFECTED CODE:\s*```dart\s*([\s\S]*?)```/);
  // [\s\S]* crosses newlines; $ with /m matches end-of-string here because [\s\S]* is greedy
  const fixMatch = trimmed.match(/^FIX:\s*([\s\S]*)$/m);

  if (!contextMatch || !affectedCodeMatch || !fixMatch) {
    return CLEAN;
  }

  return {
    kind: 'issue',
    bugName: bugMatch[1].trim(),
    diagnosticCode: bugMatch[2].trim(),
    context: contextMatch[1].trim(),
    affectedCode: affectedCodeMatch[1].trim(),
    fix: fixMatch[1].trim(),
  };
}
