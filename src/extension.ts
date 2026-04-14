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

              // Show notification once per unique set of issues for this file.
              // Key = uri + sorted diagnostic codes, so re-saving with same issues is silent.
              const key = `${uri}::${results.map((r) => r.diagnosticCode).sort().join(',')}`;
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
