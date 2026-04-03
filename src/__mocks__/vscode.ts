export const workspace = {
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue,
  }),
};
export const DiagnosticSeverity = { Warning: 1 };
export const languages = {};
export const window = {};
export const env = {};
export const commands = {};
export const CodeActionKind = { QuickFix: { value: 'quickfix' } };

export class CodeAction {
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(public title: string, public kind: unknown) {}
}
