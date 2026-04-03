"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const codeActionProvider_1 = require("./codeActionProvider");
const mockResult = {
    kind: 'issue',
    bugName: 'Missing mounted check',
    diagnosticCode: 'missing_mounted_check',
    context: '_MyWidgetState, _loadData()',
    affectedCode: 'setState(() { _data = result; });',
    fix: 'Wrap with if (mounted) guard.',
};
function makeContext(sources) {
    return {
        diagnostics: sources.map((source) => ({ source })),
    };
}
describe('FlutterCodeActionProvider', () => {
    const uri = 'file:///path/to/widget.dart';
    function makeDocument(uriString = uri) {
        return { uri: { toString: () => uriString } };
    }
    it('returns [] when no diagnostics from flutter-code-reviewer', () => {
        const map = new Map([[uri, mockResult]]);
        const provider = new codeActionProvider_1.FlutterCodeActionProvider(map);
        const actions = provider.provideCodeActions(makeDocument(), {}, makeContext(['eslint']));
        expect(actions).toEqual([]);
    });
    it('returns [] when diagnostics match source but URI is not in map (stale entry)', () => {
        const map = new Map(); // empty
        const provider = new codeActionProvider_1.FlutterCodeActionProvider(map);
        const actions = provider.provideCodeActions(makeDocument(), {}, makeContext(['flutter-code-reviewer']));
        expect(actions).toEqual([]);
    });
    it('returns two QuickFix actions when diagnostics match and map has an entry', () => {
        const map = new Map([[uri, mockResult]]);
        const provider = new codeActionProvider_1.FlutterCodeActionProvider(map);
        const actions = provider.provideCodeActions(makeDocument(), {}, makeContext(['flutter-code-reviewer']));
        expect(actions).toHaveLength(2);
        expect(actions[0].title).toBe('Copy fix prompt');
        expect(actions[0].command?.command).toBe('flutter-code-reviewer.copyFixPrompt');
        expect(actions[0].command?.arguments).toEqual([mockResult]);
        expect(actions[1].title).toBe('View details');
        expect(actions[1].command?.command).toBe('flutter-code-reviewer.viewDetails');
        expect(actions[1].command?.arguments).toEqual([mockResult]);
    });
});
//# sourceMappingURL=codeActionProvider.test.js.map