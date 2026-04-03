import { FlutterCodeActionProvider } from './codeActionProvider';
import { ReviewResult } from './reviewParser';

const mockResult: ReviewResult = {
  kind: 'issue',
  bugName: 'Missing mounted check',
  diagnosticCode: 'missing_mounted_check',
  context: '_MyWidgetState, _loadData()',
  affectedCode: 'setState(() { _data = result; });',
  fix: 'Wrap with if (mounted) guard.',
};

function makeContext(sources: string[]) {
  return {
    diagnostics: sources.map((source) => ({ source })),
  } as unknown as import('vscode').CodeActionContext;
}

describe('FlutterCodeActionProvider', () => {
  const uri = 'file:///path/to/widget.dart';

  function makeDocument(uriString = uri) {
    return { uri: { toString: () => uriString } } as unknown as import('vscode').TextDocument;
  }

  it('returns [] when no diagnostics from flutter-code-reviewer', () => {
    const map = new Map([[uri, mockResult]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext(['eslint']),
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostics match source but URI is not in map (stale entry)', () => {
    const map = new Map<string, ReviewResult>(); // empty
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext(['flutter-code-reviewer']),
    );
    expect(actions).toEqual([]);
  });

  it('returns two QuickFix actions when diagnostics match and map has an entry', () => {
    const map = new Map([[uri, mockResult]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext(['flutter-code-reviewer']),
    );
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Copy fix prompt');
    expect(actions[0].command?.command).toBe('flutter-code-reviewer.copyFixPrompt');
    expect(actions[0].command?.arguments).toEqual([mockResult]);
    expect(actions[1].title).toBe('View details');
    expect(actions[1].command?.command).toBe('flutter-code-reviewer.viewDetails');
    expect(actions[1].command?.arguments).toEqual([mockResult]);
  });
});
