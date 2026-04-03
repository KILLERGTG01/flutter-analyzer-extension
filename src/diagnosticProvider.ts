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
      const text = document.getText();
      const raw = await reviewFile(text, controller.signal);

      // Note: if reviewFile were to swallow AbortError and return normally,
      // this would guard against touching state on an aborted request.
      // In practice, fetch throws AbortError on cancellation, so this path
      // is reached only on a successful, non-aborted response.

      const parsed = parseReview(raw);

      if (parsed.kind === 'clean') {
        this.diagnostics.set(document.uri, []);
        this.reviewResults.delete(uri);
        onStatus({ kind: 'clean' });
        return;
      }

      // Fuzzy-match the affected code snippet to a document line
      const lines = text.split('\n');
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
      // Clear prior diagnostics on error (design choice: don't preserve stale state).
      // The status bar will show Ready, and the user can re-save to retry.
      this.diagnostics.set(document.uri, []);
      this.reviewResults.delete(uri);
      onStatus({ kind: 'error', message: (err as Error).message });
    } finally {
      // Only delete if this controller is still the active one.
      // A successor save may have already replaced it in the map.
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
