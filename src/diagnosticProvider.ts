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
