import { parseReview } from './reviewParser';

describe('parseReview', () => {
  it('returns CleanResult for the clean signal', () => {
    const result = parseReview('FLUTTER REVIEW: No issues detected.');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('returns CleanResult for unparseable response', () => {
    const result = parseReview('some random model output that does not match');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('returns CleanResult for empty string', () => {
    const result = parseReview('');
    expect(result).toEqual({ kind: 'clean' });
  });

  it('parses a full issue response', () => {
    const raw = [
      'FLUTTER BUG: Missing mounted check [missing_mounted_check]',
      'CONTEXT: _MyWidgetState, _loadData()',
      'AFFECTED CODE:',
      '```dart',
      'setState(() { _data = result; });',
      '```',
      'FIX: Wrap the setState call with an if (mounted) guard to avoid calling setState after the widget has been disposed.',
    ].join('\n');

    const result = parseReview(raw);
    expect(result).toEqual({
      kind: 'issue',
      bugName: 'Missing mounted check',
      diagnosticCode: 'missing_mounted_check',
      context: '_MyWidgetState, _loadData()',
      affectedCode: 'setState(() { _data = result; });',
      fix: 'Wrap the setState call with an if (mounted) guard to avoid calling setState after the widget has been disposed.',
    });
  });

  it('handles FIX: section that contains a dart code block', () => {
    const raw = [
      'FLUTTER BUG: Missing mounted check [missing_mounted_check]',
      'CONTEXT: _MyWidgetState, _loadData()',
      'AFFECTED CODE:',
      '```dart',
      'setState(() { _data = result; });',
      '```',
      'FIX: Use this guard pattern:',
      '```dart',
      'if (mounted) { setState(() { _data = result; }); }',
      '```',
    ].join('\n');

    const result = parseReview(raw);
    expect(result.kind).toBe('issue');
    if (result.kind === 'issue') {
      expect(result.fix).toContain('Use this guard pattern:');
      expect(result.fix).toContain('if (mounted)');
    }
  });

  it('handles extra leading/trailing whitespace in bug name and code', () => {
    const raw = [
      'FLUTTER BUG:  Null check on nullable  [null_check] ',
      'CONTEXT:  MyWidget, build() ',
      'AFFECTED CODE:',
      '```dart',
      '  final x = data!.value;  ',
      '```',
      'FIX:  Use a null-aware operator instead.',
    ].join('\n');

    const result = parseReview(raw);
    expect(result.kind).toBe('issue');
    if (result.kind === 'issue') {
      expect(result.bugName).toBe('Null check on nullable');
      expect(result.diagnosticCode).toBe('null_check');
      expect(result.fix).toBe('Use a null-aware operator instead.');
    }
  });
});
