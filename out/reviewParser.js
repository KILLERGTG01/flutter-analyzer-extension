"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseReview = parseReview;
const CLEAN = Object.freeze({ kind: 'clean' });
function parseReview(raw) {
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
    const results = [];
    for (const block of blocks) {
        const bugMatch = block.match(/^FLUTTER BUG:\s*(.+?)\s*\[([^\]]+)\]/m);
        if (!bugMatch) {
            continue;
        }
        const contextMatch = block.match(/^CONTEXT:\s*(.+)$/m);
        const affectedCodeMatch = block.match(/AFFECTED CODE:\s*```dart\s*([\s\S]*?)```/);
        // [\s\S]* crosses newlines; $ with /m matches end-of-block here because [\s\S]* is greedy.
        // .trim() on the result removes trailing newlines/blank lines.
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
//# sourceMappingURL=reviewParser.js.map