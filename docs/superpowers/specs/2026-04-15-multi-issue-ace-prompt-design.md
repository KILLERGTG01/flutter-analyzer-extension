# Multi-Issue Support + ACE Prompt + Attribution Visibility

**Date:** 2026-04-15  
**Status:** Approved

---

## Overview

Extend the flutter-code-reviewer VS Code extension with three improvements:

1. **Multi-issue support** — parse and display all bugs found in a Dart file (not just the first).
2. **ACE-formatted copy prompt** — copied prompts follow Act/Context/Execute structure.
3. **Attribution visibility** — users see a notification (once per issue set) and a clickable status bar entry so they know the extension helped them.

---

## Architecture

### `reviewParser.ts`

- `ParsedReview` changes from `CleanResult | ReviewResult` to `CleanResult | ReviewResult[]`.
- `parseReview` uses a global regex to find all `FLUTTER BUG:` blocks and returns an array.
- Each block is parsed into a `ReviewResult` (unchanged shape).
- Returns `CLEAN` if no blocks found.

### `diagnosticProvider.ts`

- `reviewResults` map type changes: `Map<string, ReviewResult[]>`.
- For each `ReviewResult` in the array, one `vscode.Diagnostic` is created and added to the collection.
- Each diagnostic's `code` property is set to `diagnosticCode` — used downstream to match specific result.
- `onStatus` emits `{ kind: 'issue'; results: ReviewResult[] }` (plural).

### `codeActionProvider.ts`

- Constructor receives `Map<string, ReviewResult[]>`.
- Matches the hovered diagnostic to the correct `ReviewResult` via `diagnostic.code === result.diagnosticCode`.
- "Copy fix prompt" copies single ACE-formatted prompt for that specific issue.
- "View details" unchanged (shows bugName + context).

### `ollamaClient.ts`

- System prompt updated to instruct model to return **all** bugs found, each as a separate `FLUTTER BUG:` block.
- Format per block remains:
  ```
  FLUTTER BUG: <name> [<code>]
  CONTEXT: <context>
  AFFECTED CODE:
  ```dart
  <code>
  ```
  FIX: <fix>
  ```

### `extension.ts`

#### ACE prompt format (single issue)
```
ACT: You are a Flutter developer fixing a [bugName] bug.
CONTEXT: [context]

Affected code:
```dart
[affectedCode]
```
EXECUTE: [fix]
```

#### ACE prompt format (all issues — "Copy All Prompts")
Each issue produces one ACE block; blocks separated by `\n---\n`.

#### Notification
- Shown when `status.kind === 'issue'`.
- Message: `Flutter Code Reviewer found X issue(s): [bugName1], [bugName2]…`
- Button: `Copy All Prompts`
- **Fires once per unique `uri::issueCount::diagnosticCodes` key** (stored in `Set<string>`). Key clears when file goes clean or errors.

#### Status bar
- On issue: `$(warning) Flutter Reviewer: X issues found` + `statusBar.command = 'flutter-code-reviewer.copyAllFixPrompts'`
- On clean/reviewing/error: command cleared, standard text.

#### New command: `flutter-code-reviewer.copyAllFixPrompts`
- Parameterless — reads `latestResults: ReviewResult[]` from closure.
- Builds joined ACE string and writes to clipboard.
- Shows `Information message: "X fix prompts copied to clipboard."`

#### Existing command: `flutter-code-reviewer.copyFixPrompt`
- Updated to use ACE format instead of old `FLUTTER BUG:` format.

---

## Data Flow

```
Save .dart file
  → DiagnosticProvider.review()
    → ollamaClient.reviewFile() → raw string with N FLUTTER BUG blocks
    → parseReview() → ReviewResult[]
    → Set N diagnostics on document
    → Store ReviewResult[] in reviewResults map
    → onStatus({ kind: 'issue', results: [...] })
      → extension.ts: show notification (once), update status bar + latestResults
        → user clicks "Copy All Prompts" (notification or status bar)
          → copyAllFixPrompts command → ACE blocks joined → clipboard
        → user hovers diagnostic → lightbulb
          → codeActionProvider → match by code → "Copy fix prompt" (single ACE) / "View details"
```

---

## Error Handling

- No change to error paths — `diagnosticProvider` clears results on error/abort.
- `latestResults` cleared when status goes clean or error.
- Notification set cleared on clean/error so re-introduced bugs trigger notification again.

---

## Files Changed

| File | Nature of change |
|------|-----------------|
| `src/reviewParser.ts` | Return `ReviewResult[]`, parse all blocks |
| `src/diagnosticProvider.ts` | Multi-diagnostic, plural results map, plural onStatus |
| `src/codeActionProvider.ts` | Match by code, ACE single-issue format |
| `src/ollamaClient.ts` | System prompt → return all bugs |
| `src/extension.ts` | Notification, clickable status bar, copyAllFixPrompts command, ACE format |
| `src/reviewParser.test.ts` | Update tests for array return type |
| `src/codeActionProvider.test.ts` | Update tests for array input + ACE format |

---

## Out of Scope

- Pagination / grouping of many issues in the notification.
- Per-issue "View details" webview panel.
- Severity levels per issue.
