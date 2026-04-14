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

      if (!Array.isArray(parsed)) {
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
