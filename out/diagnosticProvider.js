"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticProvider = void 0;
const vscode = __importStar(require("vscode"));
const ollamaClient_1 = require("./ollamaClient");
const reviewParser_1 = require("./reviewParser");
const lineMatch_1 = require("./lineMatch");
class DiagnosticProvider {
    constructor(diagnostics) {
        this.diagnostics = diagnostics;
        this.controllers = new Map();
        this.reviewResults = new Map();
    }
    async review(document, onStatus) {
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
            const raw = await (0, ollamaClient_1.reviewFile)(text, controller.signal);
            // Note: if reviewFile were to swallow AbortError and return normally,
            // this would guard against touching state on an aborted request.
            // In practice, fetch throws AbortError on cancellation, so this path
            // is reached only on a successful, non-aborted response.
            const parsed = (0, reviewParser_1.parseReview)(raw);
            if (parsed.kind === 'clean') {
                this.diagnostics.set(document.uri, []);
                this.reviewResults.delete(uri);
                onStatus({ kind: 'clean' });
                return;
            }
            // Fuzzy-match the affected code snippet to a document line
            const lines = text.split('\n');
            const lineIndex = (0, lineMatch_1.findMatchingLine)(lines, parsed.affectedCode);
            const lineText = document.lineAt(lineIndex).text;
            const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length);
            const diagnostic = new vscode.Diagnostic(range, parsed.bugName, vscode.DiagnosticSeverity.Warning);
            diagnostic.code = parsed.diagnosticCode;
            diagnostic.source = 'flutter-code-reviewer';
            this.diagnostics.set(document.uri, [diagnostic]);
            this.reviewResults.set(uri, parsed);
            onStatus({ kind: 'issue', result: parsed });
        }
        catch (err) {
            if (err.name === 'AbortError') {
                return;
            }
            // Clear prior diagnostics on error (design choice: don't preserve stale state).
            // The status bar will show Ready, and the user can re-save to retry.
            this.diagnostics.set(document.uri, []);
            this.reviewResults.delete(uri);
            onStatus({ kind: 'error', message: err.message });
        }
        finally {
            // Only delete if this controller is still the active one.
            // A successor save may have already replaced it in the map.
            if (this.controllers.get(uri) === controller) {
                this.controllers.delete(uri);
            }
        }
    }
    dispose() {
        for (const controller of this.controllers.values()) {
            controller.abort();
        }
        this.diagnostics.dispose();
    }
}
exports.DiagnosticProvider = DiagnosticProvider;
//# sourceMappingURL=diagnosticProvider.js.map