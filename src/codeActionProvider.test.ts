import { FlutterCodeActionProvider } from './codeActionProvider';
import { ReviewResult } from './reviewParser';

const mockResult1: ReviewResult = {
  kind: 'issue',
  bugName: 'Missing mounted check',
  diagnosticCode: 'missing_mounted_check',
  context: '_MyWidgetState, _loadData()',
  affectedCode: 'setState(() { _data = result; });',
  fix: 'Wrap with if (mounted) guard.',
};

const mockResult2: ReviewResult = {
  kind: 'issue',
  bugName: 'Null check on nullable',
  diagnosticCode: 'null_check',
  context: 'MyWidget, build()',
  affectedCode: 'final x = data!.value;',
  fix: 'Use null-aware operator.',
};

function makeContext(diagnostics: { source: string; code?: string }[]) {
  return { diagnostics } as unknown as import('vscode').CodeActionContext;
}

describe('FlutterCodeActionProvider', () => {
  const uri = 'file:///path/to/widget.dart';

  function makeDocument(uriString = uri) {
    return { uri: { toString: () => uriString } } as unknown as import('vscode').TextDocument;
  }

  it('returns [] when no diagnostics from flutter-code-reviewer', () => {
    const map = new Map([[uri, [mockResult1]]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'eslint' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostics match source but URI not in map', () => {
    const map = new Map<string, ReviewResult[]>();
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'missing_mounted_check' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns [] when diagnostic code does not match any result', () => {
    const map = new Map([[uri, [mockResult1]]]);
    const provider = new FlutterCodeActionProvider(map);
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'unknown_code' }]),
    );
    expect(actions).toEqual([]);
  });

  it('returns two QuickFix actions matching hovered diagnostic by code', () => {
    const map = new Map([[uri, [mockResult1, mockResult2]]]);
    const provider = new FlutterCodeActionProvider(map);

    // Hover over the second diagnostic
    const actions = provider.provideCodeActions(
      makeDocument(),
      {} as never,
      makeContext([{ source: 'flutter-code-reviewer', code: 'null_check' }]),
    );

    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Copy fix prompt');
    expect(actions[0].command?.command).toBe('flutter-code-reviewer.copyFixPrompt');
    expect(actions[0].command?.arguments).toEqual([mockResult2]);
    expect(actions[1].title).toBe('View details');
    expect(actions[1].command?.command).toBe('flutter-code-reviewer.viewDetails');
    expect(actions[1].command?.arguments).toEqual([mockResult2]);
  });
});
