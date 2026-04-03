import { normalizeWhitespace, findMatchingLine } from './lineMatch';

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces to one and trims', () => {
    expect(normalizeWhitespace('  foo   bar  ')).toBe('foo bar');
  });

  it('collapses tabs', () => {
    expect(normalizeWhitespace('\t\tfoo\t\tbar')).toBe('foo bar');
  });

  it('collapses mixed whitespace', () => {
    expect(normalizeWhitespace('  \t foo \n bar  ')).toBe('foo bar');
  });

  it('preserves comment text', () => {
    expect(normalizeWhitespace('  // this is a comment  ')).toBe('// this is a comment');
  });
});

describe('findMatchingLine', () => {
  const lines = [
    'class _MyWidgetState extends State<MyWidget> {',
    '  void _loadData() async {',
    '    final result = await fetchData();',
    '    setState(() { _data = result; });',
    '  }',
    '}',
  ];

  it('finds a line that exactly contains the snippet (ignoring indentation)', () => {
    expect(findMatchingLine(lines, 'setState(() { _data = result; });')).toBe(3);
  });

  it('matches despite different indentation in the snippet', () => {
    expect(findMatchingLine(lines, '        setState(() { _data = result; });')).toBe(3);
  });

  it('uses the first line of a multi-line snippet to find position', () => {
    const snippet = 'setState(() { _data = result; });\n  }';
    expect(findMatchingLine(lines, snippet)).toBe(3);
  });

  it('returns 0 when the snippet is empty', () => {
    expect(findMatchingLine(lines, '')).toBe(0);
  });

  it('returns 0 when no match found', () => {
    expect(findMatchingLine(lines, 'this line absolutely does not exist')).toBe(0);
  });

  it('returns 0 when document has no lines', () => {
    expect(findMatchingLine([], 'setState(() { });')).toBe(0);
  });
});
