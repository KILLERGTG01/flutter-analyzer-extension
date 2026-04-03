"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeAction = exports.CodeActionKind = exports.commands = exports.env = exports.window = exports.languages = exports.DiagnosticSeverity = exports.workspace = void 0;
exports.workspace = {
    getConfiguration: () => ({
        get: (_key, defaultValue) => defaultValue,
    }),
};
exports.DiagnosticSeverity = { Warning: 1 };
exports.languages = {};
exports.window = {};
exports.env = {};
exports.commands = {};
exports.CodeActionKind = { QuickFix: { value: 'quickfix' } };
class CodeAction {
    constructor(title, kind) {
        this.title = title;
        this.kind = kind;
    }
}
exports.CodeAction = CodeAction;
//# sourceMappingURL=vscode.js.map