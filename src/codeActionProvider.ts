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
