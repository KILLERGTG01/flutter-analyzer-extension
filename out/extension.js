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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const diagnosticProvider_1 = require("./diagnosticProvider");
const codeActionProvider_1 = require("./codeActionProvider");
const ollamaClient_1 = require("./ollamaClient");
async function activate(context) {
    // Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(sync~spin) Flutter Reviewer: Starting…';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // Diagnostic collection
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('flutter-code-reviewer');
    context.subscriptions.push(diagnosticCollection);
    // Diagnostic provider (owns AbortControllers + shared ReviewResult map)
    const provider = new diagnosticProvider_1.DiagnosticProvider(diagnosticCollection);
    context.subscriptions.push({ dispose: () => provider.dispose() });
    // Code action provider — shares the reviewResults map
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ language: 'dart' }, new codeActionProvider_1.FlutterCodeActionProvider(provider.reviewResults), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
    // Command: copy fix prompt
    context.subscriptions.push(vscode.commands.registerCommand('flutter-code-reviewer.copyFixPrompt', async (result) => {
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
        vscode.window.showInformationMessage('Flutter Code Reviewer: Fix prompt copied to clipboard.');
    }));
    // Command: view details
    context.subscriptions.push(vscode.commands.registerCommand('flutter-code-reviewer.viewDetails', (result) => {
        vscode.window.showInformationMessage(`[${result.diagnosticCode}] ${result.bugName} — ${result.context}`);
    }));
    // Startup health check
    const pingResult = await (0, ollamaClient_1.ping)();
    const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
    const modelName = cfg.get('modelName', 'code-review-flutter');
    if (pingResult.status === 'no-ollama') {
        statusBar.text = '$(error) Flutter Reviewer: Ollama not found';
        vscode.window.showInformationMessage('Flutter Code Reviewer: Ollama is not running. ' +
            'Install it from https://ollama.com and start it before using this extension.');
        return;
    }
    if (pingResult.status === 'no-model') {
        statusBar.text = '$(error) Flutter Reviewer: Model not found';
        vscode.window.showInformationMessage(`Flutter Code Reviewer: Model "${modelName}" not found. ` +
            `Run: ollama pull ${modelName}`);
        return;
    }
    statusBar.text = '$(check) Flutter Reviewer: Ready';
    // On-save listener
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
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
                        statusBar.text = '$(error) Flutter Reviewer: Review failed';
                        vscode.window.showWarningMessage(`Flutter Code Reviewer: Review failed — ${status.message}`);
                        break;
                }
            });
        }
        catch (err) {
            // Defensive guard: DiagnosticProvider does not re-throw, but kept here
            // in case a future refactor changes the error-propagation contract.
            vscode.window.showWarningMessage(`Flutter Code Reviewer: Review failed — ${err.message}`);
            statusBar.text = '$(check) Flutter Reviewer: Ready';
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map