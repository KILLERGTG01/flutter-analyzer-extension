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
