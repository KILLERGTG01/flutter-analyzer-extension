# Flutter Code Reviewer — VS Code Extension Design

**Date:** 2026-04-03  
**Target VS Code:** `^1.85.0`  
**Category:** Linters  
**Language activation:** `onLanguage:dart`

---

## Overview

A VS Code extension that reviews `.dart` files on save using a locally-running Ollama model (`code-review-flutter` at `localhost:11434`). Results are shown as native VS Code diagnostics (Warning severity, squiggly underlines) with two code actions attached.

---

## Architecture

Five source files, each with one responsibility:

| File | Responsibility |
|---|---|
| `src/extension.ts` | Entry point. Wires everything together, owns lifecycle (activate/deactivate), registers all disposables. |
| `src/ollamaClient.ts` | HTTP transport. `reviewFile(code, signal)` → raw string. `ping()` for health check. No parsing. |
| `src/reviewParser.ts` | Pure function `parseReview(raw)` → `ParsedReview`. No I/O. |
| `src/diagnosticProvider.ts` | Owns `DiagnosticCollection`. Calls client → parser → sets diagnostics. Holds `AbortController` per document URI. Owns the shared `Map<string, ReviewResult>`. |
| `src/codeActionProvider.ts` | `CodeActionProvider` impl. Reads from the shared map, produces two `QuickFix` actions. |

Data flows one way: `extension.ts` listens for `onDidSaveTextDocument` → `diagnosticProvider` → `ollamaClient` → `reviewParser` → diagnostics + shared map → `codeActionProvider`.

---

## Data Types

```typescript
type CleanResult = { kind: 'clean' };

type ReviewResult = {
  kind: 'issue';
  bugName: string;        // e.g. "Missing mounted check"
  diagnosticCode: string; // e.g. "missing_mounted_check"
  context: string;        // e.g. "_MyWidgetState, _loadData()"
  affectedCode: string;   // raw snippet from the dart block
  fix: string;            // everything after "FIX:" to end of response
};

type ParsedReview = CleanResult | ReviewResult;
```

---

## Model Output Format

The model emits exactly one issue per response, or a clean signal:

**Issue format:**
```
FLUTTER BUG: <bug name> [<diagnostic code>]
CONTEXT: <widget type, method name>
AFFECTED CODE:
```dart
<minimal relevant lines>
```
FIX: <free-form fix description, may or may not contain a dart code block>
```

**Clean format:**
```
FLUTTER REVIEW: No issues detected.
```

Parser behaviour:
- Extract `bugName` and `diagnosticCode` from the `FLUTTER BUG:` line
- Extract `context` from the `CONTEXT:` line
- Extract `affectedCode` as everything between `` ```dart `` and the closing ` ``` `
- Extract `fix` as everything after `FIX:` to end of response (plain text, may include a code block — handle gracefully)
- If the response starts with `FLUTTER REVIEW: No issues detected.` → return `CleanResult`
- If the response is unparseable → treat as clean (log to output channel, do not show an error diagnostic)

---

## Fuzzy Line Matching

To pin the diagnostic to a source line:

1. Normalize both `affectedCode` and each document line: collapse whitespace runs to a single space, trim leading/trailing whitespace (comments preserved)
2. Split the snippet into lines; search for the first document line containing the first snippet line as a substring
3. Highlight from matched line start to end of that line (single-line range)
4. Fallback to line 0 silently if no match found

---

## Ollama Integration

- **Approach:** Full response (`"stream": false`), single-pass parse
- **Cancellation:** Each document URI gets an `AbortController`. A new save on the same file aborts the previous in-flight request before starting a new one
- **Endpoint:** `POST {ollamaUrl}/api/chat`
- **Payload:**
  ```json
  {
    "model": "<modelName>",
    "stream": false,
    "messages": [{ "role": "user", "content": "<dart file content>" }]
  }
  ```
- Response text is extracted from `response.message.content`

---

## Startup Health Check

On `activate`, call `ollamaClient.ping()`:

1. `GET {ollamaUrl}/api/tags` — if unreachable → set status bar to "Ollama not found" + show info message with install guidance
2. Parse response, check for `modelName` in the model list — if missing → set status bar to "Model not found" + show info message with `ollama pull <modelName>` command

---

## Status Bar

| State | Text | Trigger |
|---|---|---|
| Ready | `$(check) Flutter Reviewer: Ready` | Health check passes or clean review |
| Reviewing | `$(sync~spin) Flutter Reviewer: Reviewing…` | Save fired, request in flight |
| Issue found | `$(warning) Flutter Reviewer: 1 issue found` | Review complete with finding |
| Ollama not found | `$(error) Flutter Reviewer: Ollama not found` | Health check: no connection |
| Model not found | `$(error) Flutter Reviewer: Model not found` | Health check: model absent |

---

## Code Actions

Both actions are `CodeActionKind.QuickFix`, appear only when cursor/selection overlaps a diagnostic with `source === 'flutter-code-reviewer'`.

**"Copy fix prompt"** — writes to clipboard:
```
FLUTTER BUG: <bugName> [<diagnosticCode>]
CONTEXT: <context>
AFFECTED CODE:
```dart
<affectedCode>
```
FIX: <fix>
```

**"View details"** — `vscode.window.showInformationMessage(`[<diagnosticCode>] <bugName> — <context>`)`

If the URI is not in the shared map (stale diagnostic), both actions are silently omitted.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Mid-review network failure | Clear diagnostics, status bar → Ready, show a warning message (not modal) |
| Unparseable model response | Treat as clean, log to output channel |
| Save while review in flight | Abort previous `AbortController`, start new request |
| Health check fails | Status bar error state + info message, no diagnostics attempted |

---

## Configuration

Declared in `package.json` `contributes.configuration`. Read at review time (not cached).

| Setting | Default | Description |
|---|---|---|
| `flutterCodeReviewer.ollamaUrl` | `http://localhost:11434` | Base URL for the Ollama API |
| `flutterCodeReviewer.modelName` | `code-review-flutter` | Model name to use |

---

## File Structure

```
flutter-code-reviewer/
├── package.json
├── tsconfig.json
├── .vscodeignore
├── README.md
├── CHANGELOG.md
├── icon.png
├── model/
│   └── Modelfile.flutter
└── src/
    ├── extension.ts
    ├── ollamaClient.ts
    ├── reviewParser.ts
    ├── diagnosticProvider.ts
    └── codeActionProvider.ts
```

---

## Packaging & Publishing

**Package as `.vsix`:**
```bash
npm install -g @vscode/vsce
vsce package
```

**Publish to Marketplace:**
1. Create publisher at https://marketplace.visualstudio.com/manage
2. Generate PAT in Azure DevOps (Marketplace scope: Manage)
3. `vsce login <publisher-name>`
4. `vsce publish`

`package.json` must have `"publisher": "<your-publisher-id>"` set before publishing.
