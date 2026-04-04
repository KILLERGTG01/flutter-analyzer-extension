# Flutter Code Reviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that reviews `.dart` files on save via a local Ollama model and shows results as native diagnostics with two code actions.

**Architecture:** Five focused TypeScript modules — `ollamaClient` handles HTTP transport, `reviewParser` parses the model's structured text output, `lineMatch` fuzzy-pins diagnostics to source lines, `diagnosticProvider` orchestrates the review pipeline with per-URI `AbortController` cancellation, and `codeActionProvider` attaches QuickFix actions. `extension.ts` wires everything together and owns the status bar.

**Tech Stack:** TypeScript 5, VS Code Extension API ^1.85.0, Node.js native `fetch` + `AbortController`, Jest + ts-jest (unit tests for pure functions), `@vscode/vsce` (packaging)

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `package.json` | Create | Extension manifest, contributes, scripts, jest config |
| `tsconfig.json` | Create | TypeScript compiler config |
| `.vscodeignore` | Create | Exclude src/tests/node_modules from .vsix |
| `src/reviewParser.ts` | Create | Pure parse function: raw string → `ParsedReview` |
| `src/reviewParser.test.ts` | Create | Jest unit tests for parser |
| `src/lineMatch.ts` | Create | Fuzzy line-matching utility |
| `src/lineMatch.test.ts` | Create | Jest unit tests for line matcher |
| `src/ollamaClient.ts` | Create | HTTP: `reviewFile()` + `ping()` |
| `src/diagnosticProvider.ts` | Create | Orchestrates review pipeline, owns `DiagnosticCollection` + shared map |
| `src/codeActionProvider.ts` | Create | `CodeActionProvider` impl — two QuickFix actions |
| `src/extension.ts` | Create | Entry point: wires all modules, status bar, health check |
| `model/Modelfile.flutter` | Create | Ollama Modelfile (system prompt for the model) |
| `README.md` | Create | Marketplace listing content |
| `CHANGELOG.md` | Create | Version history |
| `icon.png` | Create | 128×128 placeholder icon note |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flutter-code-reviewer",
  "displayName": "Flutter Code Reviewer",
  "description": "Reviews Dart files on save using a local Ollama model and shows results as VS Code diagnostics.",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Linters"],
  "activationEvents": ["onLanguage:dart"],
  "main": "./out/extension.js",
  "icon": "icon.png",
  "contributes": {
    "configuration": {
      "title": "Flutter Code Reviewer",
      "properties": {
        "flutterCodeReviewer.ollamaUrl": {
          "type": "string",
          "default": "http://localhost:11434",
          "description": "Base URL for the Ollama API."
        },
        "flutterCodeReviewer.modelName": {
          "type": "string",
          "default": "code-review-flutter",
          "description": "Ollama model name to use for code review."
        }
      }
    },
    "commands": [
      {
        "command": "flutter-code-reviewer.copyFixPrompt",
        "title": "Flutter Code Reviewer: Copy fix prompt"
      },
      {
        "command": "flutter-code-reviewer.viewDetails",
        "title": "Flutter Code Reviewer: View details"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "jest"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "@types/jest": "^29.0.0",
    "typescript": "^5.3.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/src/**/*.test.ts"],
    "moduleNameMapper": {
      "^vscode$": "<rootDir>/src/__mocks__/vscode.ts"
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 3: Create `.vscodeignore`**

```
.vscode/**
src/**
node_modules/**
out/**/*.map
**/*.ts
!out/**
tsconfig.json
.gitignore
```

- [ ] **Step 4: Create VS Code mock for Jest**

Jest cannot import the `vscode` module (it only exists inside VS Code's runtime). Create a minimal mock at `src/__mocks__/vscode.ts`:

```typescript
export const workspace = {
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue,
  }),
};
export const DiagnosticSeverity = { Warning: 1 };
export const languages = {};
export const window = {};
export const env = {};
export const commands = {};
export const CodeActionKind = { QuickFix: { value: 'quickfix' } };
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/anurag/development/flutter-code-reviewer
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json .vscodeignore src/__mocks__/vscode.ts
git commit -m "chore: project scaffold with jest config and vscode mock"
```

---

## Task 2: reviewParser — TDD

**Files:**
- Create: `src/reviewParser.ts`
- Create: `src/reviewParser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/reviewParser.test.ts`:

```typescript
import { parseReview } from './reviewParser';

describe('parseReview', () => {
  it('returns CleanResult for the clean signal', () => {
    const result = parseReview('FLUTTER REVIEW: No issues detected.');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('returns CleanResult for unparseable response', () => {
    const result = parseReview('some random model output that does not match');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('returns CleanResult for empty string', () => {
    const result = parseReview('');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('parses a full issue response', () => {
    const raw = [
      'FLUTTER BUG: Missing mounted check [missing_mounted_check]',
      'CONTEXT: _MyWidgetState, _loadData()',
      'AFFECTED CODE:',
      '```dart',
      'setState(() { _data = result; });',
      '```',
      'FIX: Wrap the setState call with an if (mounted) guard to avoid calling setState after the widget has been disposed.',
    ].join('\n');

    const result = parseReview(raw);
    expect(result).toEqual({
      kind: 'issue',
      bugName: 'Missing mounted check',
      diagnosticCode: 'missing_mounted_check',
      context: '_MyWidgetState, _loadData()',
      affectedCode: 'setState(() { _data = result; });',
      fix: 'Wrap the setState call with an if (mounted) guard to avoid calling setState after the widget has been disposed.',
    });
  });

  it('handles FIX: section that contains a dart code block', () => {
    const raw = [
      'FLUTTER BUG: Missing mounted check [missing_mounted_check]',
      'CONTEXT: _MyWidgetState, _loadData()',
      'AFFECTED CODE:',
      '```dart',
      'setState(() { _data = result; });',
      '```',
      'FIX: Use this guard pattern:',
      '```dart',
      'if (mounted) { setState(() { _data = result; }); }',
      '```',
    ].join('\n');

    const result = parseReview(raw);
    expect(result.kind).toBe('issue');
    if (result.kind === 'issue') {
      expect(result.fix).toContain('Use this guard pattern:');
      expect(result.fix).toContain('if (mounted)');
    }
  });

  it('handles extra leading/trailing whitespace in bug name and code', () => {
    const raw = [
      'FLUTTER BUG:  Null check on nullable  [null_check] ',
      'CONTEXT:  MyWidget, build() ',
      'AFFECTED CODE:',
      '```dart',
      '  final x = data!.value;  ',
      '```',
      'FIX:  Use a null-aware operator instead.',
    ].join('\n');

    const result = parseReview(raw);
    expect(result.kind).toBe('issue');
    if (result.kind === 'issue') {
      expect(result.bugName).toBe('Null check on nullable');
      expect(result.diagnosticCode).toBe('null_check');
      expect(result.fix).toBe('Use a null-aware operator instead.');
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/anurag/development/flutter-code-reviewer
npx jest src/reviewParser.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './reviewParser'`

- [ ] **Step 3: Implement `src/reviewParser.ts`**

```typescript
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

const CLEAN: CleanResult = { kind: 'clean' };

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
  const affectedCodeMatch = trimmed.match(/```dart\s*([\s\S]*?)```/);
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest src/reviewParser.test.ts --no-coverage
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reviewParser.ts src/reviewParser.test.ts
git commit -m "feat: add reviewParser with full test coverage"
```

---

## Task 3: lineMatch — TDD

**Files:**
- Create: `src/lineMatch.ts`
- Create: `src/lineMatch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lineMatch.test.ts`:

```typescript
import { normalizeWhitespace, findMatchingLine } from './lineMatch';

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces to one and trims', () => {
    expect(normalizeWhitespace('  foo   bar  ')).toBe('foo bar');
  });

  it('collapses tabs', () => {
    expect(normalizeWhitespace('\t\tfoo\t\tbar')).toBe('foo bar');
  });

  it('collapses mixed whitespace', () => {
    expect(normalizeWhitespace('  \t foo \n bar  ')).toBe('foo bar');
  });

  it('preserves comment text', () => {
    expect(normalizeWhitespace('  // this is a comment  ')).toBe('// this is a comment');
  });
});

describe('findMatchingLine', () => {
  const lines = [
    'class _MyWidgetState extends State<MyWidget> {',
    '  void _loadData() async {',
    '    final result = await fetchData();',
    '    setState(() { _data = result; });',
    '  }',
    '}',
  ];

  it('finds a line that exactly contains the snippet (ignoring indentation)', () => {
    expect(findMatchingLine(lines, 'setState(() { _data = result; });')).toBe(3);
  });

  it('matches despite different indentation in the snippet', () => {
    expect(findMatchingLine(lines, '        setState(() { _data = result; });')).toBe(3);
  });

  it('uses the first line of a multi-line snippet to find position', () => {
    const snippet = 'setState(() { _data = result; });\n  }';
    expect(findMatchingLine(lines, snippet)).toBe(3);
  });

  it('returns 0 when the snippet is empty', () => {
    expect(findMatchingLine(lines, '')).toBe(0);
  });

  it('returns 0 when no match found', () => {
    expect(findMatchingLine(lines, 'this line absolutely does not exist')).toBe(0);
  });

  it('returns 0 when document has no lines', () => {
    expect(findMatchingLine([], 'setState(() { });')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest src/lineMatch.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './lineMatch'`

- [ ] **Step 3: Implement `src/lineMatch.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest src/lineMatch.test.ts --no-coverage
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Run all tests together**

```bash
npx jest --no-coverage
```

Expected: All 16 tests PASS (6 parser + 10 line match).

- [ ] **Step 6: Commit**

```bash
git add src/lineMatch.ts src/lineMatch.test.ts
git commit -m "feat: add fuzzy line matcher with full test coverage"
```

---

## Task 4: ollamaClient

**Files:**
- Create: `src/ollamaClient.ts`

- [ ] **Step 1: Create `src/ollamaClient.ts`**

```typescript
import * as vscode from 'vscode';

export type PingResult =
  | { status: 'ok' }
  | { status: 'no-ollama' }
  | { status: 'no-model' };

function getConfig(): { ollamaUrl: string; modelName: string } {
  const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
  return {
    ollamaUrl: cfg.get<string>('ollamaUrl', 'http://localhost:11434'),
    modelName: cfg.get<string>('modelName', 'code-review-flutter'),
  };
}

export async function reviewFile(
  code: string,
  signal: AbortSignal,
): Promise<string> {
  const { ollamaUrl, modelName } = getConfig();

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      stream: false,
      messages: [{ role: 'user', content: code }],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama API responded with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { message: { content: string } };
  return data.message.content;
}

export async function ping(): Promise<PingResult> {
  const { ollamaUrl, modelName } = getConfig();

  let data: { models: { name: string }[] };

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { status: 'no-ollama' };
    }
    data = (await response.json()) as { models: { name: string }[] };
  } catch {
    return { status: 'no-ollama' };
  }

  // Ollama model names include a tag suffix (e.g. "code-review-flutter:latest")
  const modelExists = data.models.some(
    (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
  );

  return modelExists ? { status: 'ok' } : { status: 'no-model' };
}
```

- [ ] **Step 2: Verify compile passes**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/ollamaClient.ts
git commit -m "feat: add ollamaClient with reviewFile and ping"
```

---

## Task 5: diagnosticProvider

**Files:**
- Create: `src/diagnosticProvider.ts`

- [ ] **Step 1: Create `src/diagnosticProvider.ts`**

```typescript
import * as vscode from 'vscode';
import { reviewFile } from './ollamaClient';
import { parseReview, ReviewResult } from './reviewParser';
import { findMatchingLine } from './lineMatch';

export type ReviewStatus =
  | { kind: 'reviewing' }
  | { kind: 'clean' }
  | { kind: 'issue'; result: ReviewResult }
  | { kind: 'error'; message: string };

export class DiagnosticProvider {
  private controllers = new Map<string, AbortController>();
  public reviewResults = new Map<string, ReviewResult>();

  constructor(private diagnostics: vscode.DiagnosticCollection) {}

  async review(
    document: vscode.TextDocument,
    onStatus: (status: ReviewStatus) => void,
  ): Promise<void> {
    const uri = document.uri.toString();

    // Cancel any in-flight request for this document
    const existing = this.controllers.get(uri);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    this.controllers.set(uri, controller);
    onStatus({ kind: 'reviewing' });

    try {
      const raw = await reviewFile(document.getText(), controller.signal);

      // Aborted: another save came in — don't touch state
      if (controller.signal.aborted) {
        return;
      }

      const parsed = parseReview(raw);

      if (parsed.kind === 'clean') {
        this.diagnostics.set(document.uri, []);
        this.reviewResults.delete(uri);
        onStatus({ kind: 'clean' });
        return;
      }

      // Fuzzy-match the affected code snippet to a document line
      const lines = document.getText().split('\n');
      const lineIndex = findMatchingLine(lines, parsed.affectedCode);
      const lineText = document.lineAt(lineIndex).text;
      const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length);

      const diagnostic = new vscode.Diagnostic(
        range,
        parsed.bugName,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.code = parsed.diagnosticCode;
      diagnostic.source = 'flutter-code-reviewer';

      this.diagnostics.set(document.uri, [diagnostic]);
      this.reviewResults.set(uri, parsed);
      onStatus({ kind: 'issue', result: parsed });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      this.diagnostics.set(document.uri, []);
      this.reviewResults.delete(uri);
      onStatus({ kind: 'error', message: (err as Error).message });
    } finally {
      this.controllers.delete(uri);
    }
  }

  dispose(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.diagnostics.dispose();
  }
}
```

- [ ] **Step 2: Verify compile passes**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/diagnosticProvider.ts
git commit -m "feat: add DiagnosticProvider with AbortController cancellation"
```

---

## Task 6: codeActionProvider

**Files:**
- Create: `src/codeActionProvider.ts`

- [ ] **Step 1: Create `src/codeActionProvider.ts`**

```typescript
import * as vscode from 'vscode';
import { ReviewResult } from './reviewParser';

export class FlutterCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private reviewResults: Map<string, ReviewResult>) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const relevant = context.diagnostics.filter(
      (d) => d.source === 'flutter-code-reviewer',
    );
    if (relevant.length === 0) {
      return [];
    }

    const result = this.reviewResults.get(document.uri.toString());
    if (!result) {
      return [];
    }

    const copyAction = new vscode.CodeAction(
      'Copy fix prompt',
      vscode.CodeActionKind.QuickFix,
    );
    copyAction.command = {
      command: 'flutter-code-reviewer.copyFixPrompt',
      title: 'Copy fix prompt',
      arguments: [result],
    };

    const viewAction = new vscode.CodeAction(
      'View details',
      vscode.CodeActionKind.QuickFix,
    );
    viewAction.command = {
      command: 'flutter-code-reviewer.viewDetails',
      title: 'View details',
      arguments: [result],
    };

    return [copyAction, viewAction];
  }
}
```

- [ ] **Step 2: Verify compile passes**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/codeActionProvider.ts
git commit -m "feat: add FlutterCodeActionProvider with copy and view actions"
```

---

## Task 7: extension.ts — entry point

**Files:**
- Create: `src/extension.ts`

- [ ] **Step 1: Create `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import { DiagnosticProvider } from './diagnosticProvider';
import { FlutterCodeActionProvider } from './codeActionProvider';
import { ping } from './ollamaClient';
import { ReviewResult } from './reviewParser';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Status bar
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = '$(sync~spin) Flutter Reviewer: Starting…';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Diagnostic collection
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('flutter-code-reviewer');
  context.subscriptions.push(diagnosticCollection);

  // Diagnostic provider (owns AbortControllers + shared ReviewResult map)
  const provider = new DiagnosticProvider(diagnosticCollection);
  context.subscriptions.push({ dispose: () => provider.dispose() });

  // Code action provider — shares the reviewResults map
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'dart' },
      new FlutterCodeActionProvider(provider.reviewResults),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  // Command: copy fix prompt
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flutter-code-reviewer.copyFixPrompt',
      async (result: ReviewResult) => {
        const text = [
          `FLUTTER BUG: ${result.bugName} [${result.diagnosticCode}]`,
          `CONTEXT: ${result.context}`,
          'AFFECTED CODE:',
          '```dart',
          result.affectedCode,
          '```',
          `FIX: ${result.fix}`,
        ].join('\n');
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
          'Flutter Code Reviewer: Fix prompt copied to clipboard.',
        );
      },
    ),
  );

  // Command: view details
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flutter-code-reviewer.viewDetails',
      (result: ReviewResult) => {
        vscode.window.showInformationMessage(
          `[${result.diagnosticCode}] ${result.bugName} — ${result.context}`,
        );
      },
    ),
  );

  // Startup health check
  const pingResult = await ping();
  const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
  const modelName = cfg.get<string>('modelName', 'code-review-flutter');

  if (pingResult.status === 'no-ollama') {
    statusBar.text = '$(error) Flutter Reviewer: Ollama not found';
    vscode.window.showInformationMessage(
      'Flutter Code Reviewer: Ollama is not running. ' +
        'Install it from https://ollama.com and start it before using this extension.',
    );
    return;
  }

  if (pingResult.status === 'no-model') {
    statusBar.text = '$(error) Flutter Reviewer: Model not found';
    vscode.window.showInformationMessage(
      `Flutter Code Reviewer: Model "${modelName}" not found. ` +
        `Run: ollama pull ${modelName}`,
    );
    return;
  }

  statusBar.text = '$(check) Flutter Reviewer: Ready';

  // On-save listener
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (document.languageId !== 'dart') {
        return;
      }

      try {
        await provider.review(document, (status) => {
          switch (status.kind) {
            case 'reviewing':
              statusBar.text = '$(sync~spin) Flutter Reviewer: Reviewing…';
              break;
            case 'issue':
              statusBar.text = '$(warning) Flutter Reviewer: 1 issue found';
              break;
            case 'clean':
              statusBar.text = '$(check) Flutter Reviewer: Ready';
              break;
            case 'error':
              statusBar.text = '$(check) Flutter Reviewer: Ready';
              break;
          }
        });
      } catch (err) {
        vscode.window.showWarningMessage(
          `Flutter Code Reviewer: Review failed — ${(err as Error).message}`,
        );
        statusBar.text = '$(check) Flutter Reviewer: Ready';
      }
    }),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 2: Verify full compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All 16 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire extension entry point with status bar and health check"
```

---

## Task 8: Supporting files

**Files:**
- Create: `model/Modelfile.flutter`
- Create: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `model/Modelfile.flutter`**

```
FROM codellama:7b-instruct

SYSTEM """
You are a Flutter and Dart code reviewer. When given Dart source code, identify the single most important issue.

Respond ONLY in this exact format:

FLUTTER BUG: <bug name> [<diagnostic_code_snake_case>]
CONTEXT: <widget type or class name>, <method name>
AFFECTED CODE:
```dart
<minimal relevant lines showing the issue>
```
FIX: <explanation of the fix>

If there are no issues, respond with exactly:
FLUTTER REVIEW: No issues detected.

Do not include any other text, preamble, or explanation outside of this format.
"""
```

> **Note:** This Modelfile is a starting point. The actual trained model (`code-review-flutter`) is created separately via `ollama create code-review-flutter -f model/Modelfile.flutter`.

- [ ] **Step 2: Create `README.md`**

```markdown
# Flutter Code Reviewer

Reviews `.dart` files on save using a locally-running [Ollama](https://ollama.com) model and shows results as native VS Code diagnostics.

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- The `code-review-flutter` model loaded: `ollama pull code-review-flutter`

## Features

- Automatic review on save for `.dart` files
- Inline warning diagnostics with squiggly underlines
- **Copy fix prompt** — copies the full bug/fix block to clipboard for use with any AI assistant
- **View details** — shows context in a VS Code info message
- Status bar indicator: Ready / Reviewing… / issue found / Ollama not found

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `flutterCodeReviewer.ollamaUrl` | `http://localhost:11434` | Base URL for the Ollama API |
| `flutterCodeReviewer.modelName` | `code-review-flutter` | Ollama model name |

## Setup

1. Install Ollama: https://ollama.com
2. Pull the model: `ollama pull code-review-flutter`
3. Open a Flutter project and save any `.dart` file

## Building the model locally

```bash
ollama create code-review-flutter -f model/Modelfile.flutter
```
```

- [ ] **Step 3: Create `CHANGELOG.md`**

```markdown
# Changelog

## [0.1.0] - 2026-04-03

### Added
- Initial release
- Dart file review on save via local Ollama model
- Inline Warning diagnostics with fuzzy line matching
- "Copy fix prompt" and "View details" code actions
- Status bar with Reviewing / Ready / error states
- Startup health check for Ollama and model availability
- Configurable `ollamaUrl` and `modelName` settings
```

- [ ] **Step 4: Add icon note**

The `icon.png` field in `package.json` requires a 128×128 PNG. Create a placeholder:

```bash
# If you have ImageMagick:
convert -size 128x128 xc:#0175C2 -fill white -font DejaVu-Sans-Bold \
  -pointsize 40 -gravity center -annotate 0 "FCR" icon.png

# Or download any 128x128 PNG and name it icon.png
# Without icon.png, remove the "icon" field from package.json before packaging
```

If skipping the icon for now, remove `"icon": "icon.png"` from `package.json`.

- [ ] **Step 5: Commit**

```bash
git add model/Modelfile.flutter README.md CHANGELOG.md
git commit -m "docs: add README, CHANGELOG, and Modelfile"
```

---

## Task 9: Compile and package

**Files:** No new files — compile `src/` to `out/`, then package.

- [ ] **Step 1: Compile TypeScript**

```bash
cd /Users/anurag/development/flutter-code-reviewer
npx tsc -p ./
```

Expected: `out/` directory created with `extension.js`, `ollamaClient.js`, `reviewParser.js`, `lineMatch.js`, `diagnosticProvider.js`, `codeActionProvider.js`. No errors.

- [ ] **Step 2: Run all tests one final time**

```bash
npx jest --no-coverage
```

Expected: All 16 tests PASS.

- [ ] **Step 3: Install vsce**

```bash
npm install -g @vscode/vsce
```

- [ ] **Step 4: Package the extension**

Before packaging, ensure `package.json` has `"publisher"` set (even a placeholder works for local install):

```bash
vsce package
```

Expected: `flutter-code-reviewer-0.1.0.vsix` created in the project root.

If you get `Missing publisher name` — edit `package.json` and set `"publisher": "your-actual-publisher-id"`.

- [ ] **Step 5: Install locally to test**

```bash
code --install-extension flutter-code-reviewer-0.1.0.vsix
```

Then open a Flutter project in VS Code, open a `.dart` file, and save it. The status bar should show "Reviewing…" then either "Ready" or "1 issue found".

- [ ] **Step 6: Publish to Marketplace**

```bash
# One-time setup:
# 1. Create a publisher at https://marketplace.visualstudio.com/manage
# 2. Generate a PAT in Azure DevOps → Organization Settings → Personal Access Tokens
#    Scope: Marketplace → Manage
vsce login your-publisher-id

# Publish:
vsce publish
```

- [ ] **Step 7: Final commit**

```bash
git add out/ package.json
git commit -m "build: compile output and finalize package.json publisher"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Activates on `onLanguage:dart` — `activationEvents` in Task 1
- [x] POST to `/api/chat` with full file content — `ollamaClient.reviewFile()` in Task 4
- [x] Parse structured response — `reviewParser.ts` in Task 2
- [x] `DiagnosticCollection` Warning with affected line — `diagnosticProvider.ts` in Task 5
- [x] "Copy fix prompt" code action — `codeActionProvider.ts` Task 6 + command in Task 7
- [x] "View details" code action — same
- [x] Status bar states: Ready / Reviewing / 1 issue found / Ollama not found / Model not found — Task 7
- [x] Startup health check with setup guidance — `ping()` in Task 4, wired in Task 7
- [x] Configurable `ollamaUrl` and `modelName` — Task 1 `package.json` + read in `ollamaClient`
- [x] Cancel in-flight request on new save — `AbortController` in `diagnosticProvider` Task 5
- [x] Fuzzy line matching with fallback to line 0 — `lineMatch.ts` Task 3
- [x] Packaging + Marketplace publish instructions — Task 9
