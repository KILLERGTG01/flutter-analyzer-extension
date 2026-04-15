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
exports.FlutterCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
class FlutterCodeActionProvider {
    constructor(reviewResults) {
        this.reviewResults = reviewResults;
    }
    provideCodeActions(document, _range, context) {
        // context.diagnostics is VS Code's authoritative truth for what is currently shown.
        // Only produce actions when at least one of our diagnostics is actually visible.
        const relevant = context.diagnostics.filter((d) => d.source === 'flutter-code-reviewer');
        if (relevant.length === 0) {
            return [];
        }
        // Guard against a race where VS Code delivers a code-action request after
        // a diagnostic was shown but before DiagnosticProvider cleared the map entry.
        const results = this.reviewResults.get(document.uri.toString());
        if (!results) {
            return [];
        }
        // Match the hovered diagnostic to its specific ReviewResult by diagnosticCode.
        // Guard: VS Code's Diagnostic.code can be string | number | {value,target} | undefined.
        // We only set string codes in diagnosticProvider.ts; reject unexpected shapes explicitly.
        const hoveredCode = relevant[0].code;
        if (typeof hoveredCode !== 'string') {
            return [];
        }
        const result = results.find((r) => r.diagnosticCode === hoveredCode);
        if (!result) {
            return [];
        }
        const copyAction = new vscode.CodeAction('Copy fix prompt', vscode.CodeActionKind.QuickFix);
        copyAction.command = {
            command: 'flutter-code-reviewer.copyFixPrompt',
            title: 'Copy fix prompt',
            arguments: [result],
        };
        const viewAction = new vscode.CodeAction('View details', vscode.CodeActionKind.QuickFix);
        viewAction.command = {
            command: 'flutter-code-reviewer.viewDetails',
            title: 'View details',
            arguments: [result],
        };
        return [copyAction, viewAction];
    }
}
exports.FlutterCodeActionProvider = FlutterCodeActionProvider;
//# sourceMappingURL=codeActionProvider.js.map