import * as vscode from 'vscode';
import { ReviewResult } from './reviewParser';

export class FlutterCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private reviewResults: Map<string, ReviewResult>) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    // context.diagnostics is VS Code's authoritative truth for what is currently shown.
    // Only produce actions when at least one of our diagnostics is actually visible.
    const relevant = context.diagnostics.filter(
      (d) => d.source === 'flutter-code-reviewer',
    );
    if (relevant.length === 0) {
      return [];
    }

    // Guard against a race where VS Code delivers a code-action request after
    // a diagnostic was shown but before DiagnosticProvider cleared the map entry.
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
