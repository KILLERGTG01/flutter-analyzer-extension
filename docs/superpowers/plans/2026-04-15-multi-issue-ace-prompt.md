# Multi-Issue + ACE Prompt + Attribution Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse all bugs from Ollama response, show multiple diagnostics, copy prompts in ACE format, and surface attribution via notification + clickable status bar.

**Architecture:** `reviewParser` returns `ReviewResult[]`; `diagnosticProvider` emits one `vscode.Diagnostic` per result; `codeActionProvider` matches hovered diagnostic by `code` to its result; `extension.ts` drives attribution (one-time notification + clickable status bar) and ACE formatting.

**Tech Stack:** TypeScript, VS Code Extension API, Jest

---

### Task 1: Update `reviewParser.ts` to return all bugs

**Files:**
- Modify: `src/reviewParser.ts`
- Test: `src/reviewParser.test.ts`

- [ ] **Step 1: Write failing tests for multi-issue parsing**

Replace the content of `src/reviewParser.test.ts` with:

```ts
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

  it('parses a single issue response into a one-element array', () => {
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
    expect(result).toEqual([
      {
        kind: 'issue',
        bugName: 'Missing mounted check',
        diagnosticCode: 'missing_mounted_check',
        context: '_MyWidgetState, _loadData()',
        affectedCode: 'setState(() { _data = result; });',
        fix: 'Wrap the setState call with an if (mounted) guard to avoid calling setState after the widget has been disposed.',
      },
    ]);
  });

  it('parses two FLUTTER BUG blocks into a two-element array', () => {
    const raw = [
      'FLUTTER BUG: Missing mounted check [missing_mounted_check]',
      'CONTEXT: _MyWidgetState, _loadData()',
      'AFFECTED CODE:',
      '```dart',
      'setState(() { _data = result; });',
      '```',
      'FIX: Wrap with if (mounted) guard.',
      '',
      'FLUTTER BUG: Null check on nullable [null_check]',
      'CONTEXT: MyWidget, build()',
      'AFFECTED CODE:',
      '```dart',
      'final x = data!.value;',
      '```',
      'FIX: Use a null-aware operator instead.',
    ].join('\n');

    const result = parseReview(raw);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result).toHaveLength(2);
    expect(result[0].diagnosticCode).toBe('missing_mounted_check');
    expect(result[1].diagnosticCode).toBe('null_check');
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
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result[0].fix).toContain('Use this guard pattern:');
    expect(result[0].fix).toContain('if (mounted)');
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
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result[0].bugName).toBe('Null check on nullable');
    expect(result[0].diagnosticCode).toBe('null_check');
    expect(result[0].fix).toBe('Use a null-aware operator instead.');
  });

  it('skips malformed blocks and returns only valid ones', () => {
    const raw = [
      'FLUTTER BUG: Good bug [good_bug]',
      'CONTEXT: MyWidget, build()',
      'AFFECTED CODE:',
      '```dart',
      'final x = data!.value;',
      '```',
      'FIX: Use null-aware operator.',
      '',
      'FLUTTER BUG: Bad bug [bad_bug]',
      // Missing CONTEXT, AFFECTED CODE, FIX
    ].join('\n');

    const result = parseReview(raw);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result).toHaveLength(1);
    expect(result[0].diagnosticCode).toBe('good_bug');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest src/reviewParser.test.ts --no-coverage
```

Expected: failures on multi-issue tests (single-issue test also fails — return type changed).

- [ ] **Step 3: Update `src/reviewParser.ts`**

Replace the entire file:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest src/reviewParser.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reviewParser.ts src/reviewParser.test.ts
git commit -m "feat: parse all FLUTTER BUG blocks, return ReviewResult[]"
```

---

### Task 2: Update `diagnosticProvider.ts` for multi-issue

**Files:**
- Modify: `src/diagnosticProvider.ts`

- [ ] **Step 1: Update `src/diagnosticProvider.ts`**

Replace the entire file:

```ts
import * as vscode from 'vscode';
import { reviewFile } from './ollamaClient';
import { parseReview, ReviewResult } from './reviewParser';
import { findMatchingLine } from './lineMatch';

export type ReviewStatus =
  | { kind: 'reviewing' }
  | { kind: 'clean' }
  | { kind: 'issue'; results: ReviewResult[] }
  | { kind: 'error'; message: string };

export class DiagnosticProvider {
  private controllers = new Map<string, AbortController>();
  public reviewResults = new Map<string, ReviewResult[]>();

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
      const text = document.getText();
      const raw = await reviewFile(text, controller.signal);

      const parsed = parseReview(raw);

      if (parsed.kind === 'clean') {
        this.diagnostics.set(document.uri, []);
        this.reviewResults.delete(uri);
        onStatus({ kind: 'clean' });
        return;
      }

      // parsed is ReviewResult[] here
      const lines = text.split('\n');
      const vsDiagnostics = parsed.map((result) => {
        const lineIndex = findMatchingLine(lines, result.affectedCode);
        const lineText = document.lineAt(lineIndex).text;
        const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length);
        const diagnostic = new vscode.Diagnostic(
          range,
          result.bugName,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.code = result.diagnosticCode;
        diagnostic.source = 'flutter-code-reviewer';
        return diagnostic;
      });

      this.diagnostics.set(document.uri, vsDiagnostics);
      this.reviewResults.set(uri, parsed);
      onStatus({ kind: 'issue', results: parsed });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      this.diagnostics.set(document.uri, []);
      this.reviewResults.delete(uri);
      onStatus({ kind: 'error', message: (err as Error).message });
    } finally {
      if (this.controllers.get(uri) === controller) {
        this.controllers.delete(uri);
      }
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

- [ ] **Step 2: Run full test suite to catch regressions**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest --no-coverage
```

Expected: `reviewParser` tests pass. `codeActionProvider` tests FAIL (type mismatch — fixed in Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/diagnosticProvider.ts
git commit -m "feat: diagnosticProvider emits one diagnostic per issue, stores ReviewResult[]"
```

---

### Task 3: Update `codeActionProvider.ts` + tests

**Files:**
- Modify: `src/codeActionProvider.ts`
- Test: `src/codeActionProvider.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the entire `src/codeActionProvider.test.ts`:

```ts
import { FlutterCodeActionProvider } from './codeActionProvider';
import { ReviewResult } from './reviewParser';

const mockResult1: ReviewResult = {
  kind: 'issue',
  bugName: 'Missing mounted check',
  diagnosticCode: 'missing_mounted_check',
  context: '_MyWidgetState, _loadData()',
  affectedCode: 'setState(() { _data = result; });',
  fix: 'Wrap with if (mounted) guard.',
};

const mockResult2: ReviewResult = {
  kind: 'issue',
  bugName: 'Null check on nullable',
  diagnosticCode: 'null_check',
  context: 'MyWidget, build()',
  affectedCode: 'final x = data!.value;',
  fix: 'Use null-aware operator.',
};

function makeContext(diagnostics: { source: string; code?: string }[]) {
  return { diagnostics } as unknown as import('vscode').CodeActionContext;
}

describe('FlutterCodeActionProvider', () => {
  const uri = 'file:///path/to/widget.dart';

  function makeDocument(uriString = uri) {
    return { uri: { toString: () => uriString } } as unknown as import('vscode').TextDocument;
  }

  it('returns [] when no diagnostics from flutter-code-reviewer', () => {
    const map = new Map([[uri, [mockResult1]]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'eslint' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostics match source but URI not in map', () => {
    const map = new Map<string, ReviewResult[]>();
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'missing_mounted_check' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostic code does not match any result', () => {
    const map = new Map([[uri, [mockResult1]]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'unknown_code' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns two QuickFix actions matching hovered diagnostic by code', () => {
    const map = new Map([[uri, [mockResult1, mockResult2]]]);
    const provider = new FlutterCodeActionProvider(map);

    // Hover over the second diagnostic
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'null_check' }]),
    );

    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Copy fix prompt');
    expect(actions[0].command?.command).toBe('flutter-code-reviewer.copyFixPrompt');
    expect(actions[0].command?.arguments).toEqual([mockResult2]);
    expect(actions[1].title).toBe('View details');
    expect(actions[1].command?.command).toBe('flutter-code-reviewer.viewDetails');
    expect(actions[1].command?.arguments).toEqual([mockResult2]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest src/codeActionProvider.test.ts --no-coverage
```

Expected: FAIL — constructor still accepts `Map<string, ReviewResult>` (singular).

- [ ] **Step 3: Update `src/codeActionProvider.ts`**

Replace the entire file:

```ts
import * as vscode from 'vscode';
import { ReviewResult } from './reviewParser';

export class FlutterCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private reviewResults: Map<string, ReviewResult[]>) {}

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

    const results = this.reviewResults.get(document.uri.toString());
    if (!results) {
      return [];
    }

    // Match the hovered diagnostic to its specific ReviewResult by diagnosticCode
    const result = results.find(
      (r) => r.diagnosticCode === String(relevant[0].code),
    );
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest src/codeActionProvider.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/codeActionProvider.ts src/codeActionProvider.test.ts
git commit -m "feat: codeActionProvider accepts ReviewResult[], matches diagnostic by code"
```

---

### Task 4: Update `ollamaClient.ts` system prompt

**Files:**
- Modify: `src/ollamaClient.ts`

- [ ] **Step 1: Add system message to `reviewFile` in `src/ollamaClient.ts`**

In the `reviewFile` function, replace the `messages` array in the fetch body:

Old:
```ts
messages: [{ role: 'user', content: code }],
```

New:
```ts
messages: [
  {
    role: 'system',
    content: [
      'You are a Flutter code reviewer.',
      'Find ALL bugs in the provided code.',
      'For each bug found, output a block in exactly this format:',
      '',
      'FLUTTER BUG: <short descriptive name> [<snake_case_code>]',
      'CONTEXT: <class and/or method where the bug appears>',
      'AFFECTED CODE:',
      '```dart',
      '<the affected code snippet>',
      '```',
      'FIX: <explanation of how to fix it>',
      '',
      'Separate multiple bug blocks with a blank line.',
      'If no bugs are found, output exactly: FLUTTER REVIEW: No issues detected.',
    ].join('\n'),
  },
  { role: 'user', content: code },
],
```

- [ ] **Step 2: Run full suite to confirm no regressions**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest --no-coverage
```

Expected: all tests PASS (ollamaClient has no unit tests — covered by integration).

- [ ] **Step 3: Commit**

```bash
git add src/ollamaClient.ts
git commit -m "feat: system prompt instructs model to return all bugs as separate blocks"
```

---

### Task 5: Update `extension.ts` — ACE format, notification, clickable status bar

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Replace `src/extension.ts` with the updated version**

```ts
import * as vscode from 'vscode';
import { DiagnosticProvider } from './diagnosticProvider';
import { FlutterCodeActionProvider } from './codeActionProvider';
import { ping } from './ollamaClient';
import { ReviewResult } from './reviewParser';

function buildAcePrompt(result: ReviewResult): string {
  return [
    `ACT: You are a Flutter developer fixing a ${result.bugName} bug.`,
    `CONTEXT: ${result.context}`,
    '',
    'Affected code:',
    '```dart',
    result.affectedCode,
    '```',
    `EXECUTE: ${result.fix}`,
  ].join('\n');
}

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

  // Diagnostic provider (owns AbortControllers + shared ReviewResult[] map)
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

  // Tracks the most recent set of results for the status bar copy command
  let latestResults: ReviewResult[] | undefined;

  // Tracks which issue sets have already triggered a notification (avoid repeat popups)
  const notifiedKeys = new Set<string>();

  // Command: copy single fix prompt (from diagnostic lightbulb) — ACE format
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flutter-code-reviewer.copyFixPrompt',
      async (result: ReviewResult) => {
        await vscode.env.clipboard.writeText(buildAcePrompt(result));
        vscode.window.showInformationMessage(
          'Flutter Code Reviewer: Fix prompt copied to clipboard.',
        );
      },
    ),
  );

  // Command: copy all fix prompts (from status bar / notification) — ACE format
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'flutter-code-reviewer.copyAllFixPrompts',
      async () => {
        if (!latestResults || latestResults.length === 0) {
          return;
        }
        const text = latestResults.map(buildAcePrompt).join('\n---\n');
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
          `Flutter Code Reviewer: ${latestResults.length} fix prompt(s) copied to clipboard.`,
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
        'Install it from https://ollama.com, start it, then reload this window (Developer: Reload Window).',
    );
    return;
  }

  if (pingResult.status === 'no-model') {
    statusBar.text = '$(error) Flutter Reviewer: Model not found';
    vscode.window.showInformationMessage(
      `Flutter Code Reviewer: Model "${modelName}" not found. ` +
        `Run: ollama pull ${modelName}, then reload this window (Developer: Reload Window).`,
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

      const uri = document.uri.toString();

      try {
        await provider.review(document, async (status) => {
          switch (status.kind) {
            case 'reviewing':
              statusBar.text = '$(sync~spin) Flutter Reviewer: Reviewing…';
              statusBar.command = undefined;
              break;

            case 'issue': {
              const { results } = status;
              const count = results.length;
              latestResults = results;

              statusBar.text = `$(warning) Flutter Reviewer: ${count} issue(s) found`;
              statusBar.command = 'flutter-code-reviewer.copyAllFixPrompts';

              // Show notification once per unique set of issues for this file
              const key = `${uri}::${results.map((r) => r.diagnosticCode).join(',')}`;
              if (!notifiedKeys.has(key)) {
                notifiedKeys.add(key);
                const bugNames = results.map((r) => r.bugName).join(', ');
                const selection = await vscode.window.showInformationMessage(
                  `Flutter Code Reviewer found ${count} issue(s): ${bugNames}`,
                  'Copy All Prompts',
                );
                if (selection === 'Copy All Prompts') {
                  await vscode.commands.executeCommand(
                    'flutter-code-reviewer.copyAllFixPrompts',
                  );
                }
              }
              break;
            }

            case 'clean':
              latestResults = undefined;
              statusBar.text = '$(check) Flutter Reviewer: Ready';
              statusBar.command = undefined;
              for (const k of [...notifiedKeys]) {
                if (k.startsWith(`${uri}::`)) {
                  notifiedKeys.delete(k);
                }
              }
              break;

            case 'error':
              latestResults = undefined;
              statusBar.text = '$(error) Flutter Reviewer: Review failed';
              statusBar.command = undefined;
              for (const k of [...notifiedKeys]) {
                if (k.startsWith(`${uri}::`)) {
                  notifiedKeys.delete(k);
                }
              }
              vscode.window.showWarningMessage(
                `Flutter Code Reviewer: Review failed — ${status.message}`,
              );
              break;
          }
        });
      } catch (err) {
        vscode.window.showWarningMessage(
          `Flutter Code Reviewer: Review failed — ${(err as Error).message}`,
        );
        statusBar.text = '$(check) Flutter Reviewer: Ready';
        statusBar.command = undefined;
      }
    }),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/anurag/development/flutter-code-reviewer && npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: ACE prompt format, one-time notification, clickable status bar for copy all"
```

