"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWhitespace = normalizeWhitespace;
exports.findMatchingLine = findMatchingLine;
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}
/**
 * Returns the 0-based index of the first document line that contains the
 * (normalized) first line of `snippet` as a substring.
 *
 * Returns 0 both when the match is genuinely on line 0 AND when no match
 * is found — callers cannot distinguish the two cases. This is intentional:
 * the spec calls for a silent fallback to line 0 rather than a null/sentinel.
 */
function findMatchingLine(documentLines, snippet) {
    const snippetLines = snippet
        .split('\n')
        .map(normalizeWhitespace)
        .filter(Boolean);
    if (snippetLines.length === 0 || documentLines.length === 0) {
        return 0;
    }
    const firstSnippetLine = snippetLines[0];
    for (let i = 0; i < documentLines.length; i++) {
        // documentLine.includes(snippet) — not the reverse — so that snippet
        // indentation stripped by normalizeWhitespace still matches indented source lines
        if (normalizeWhitespace(documentLines[i]).includes(firstSnippetLine)) {
            return i;
        }
    }
    return 0;
}
//# sourceMappingURL=lineMatch.js.map