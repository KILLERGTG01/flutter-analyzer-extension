"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lineMatch_1 = require("./lineMatch");
describe('normalizeWhitespace', () => {
    it('collapses multiple spaces to one and trims', () => {
        expect((0, lineMatch_1.normalizeWhitespace)('  foo   bar  ')).toBe('foo bar');
    });
    it('collapses tabs', () => {
        expect((0, lineMatch_1.normalizeWhitespace)('\t\tfoo\t\tbar')).toBe('foo bar');
    });
    it('collapses mixed whitespace', () => {
        expect((0, lineMatch_1.normalizeWhitespace)('  \t foo \n bar  ')).toBe('foo bar');
    });
    it('preserves comment text', () => {
        expect((0, lineMatch_1.normalizeWhitespace)('  // this is a comment  ')).toBe('// this is a comment');
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
        expect((0, lineMatch_1.findMatchingLine)(lines, 'setState(() { _data = result; });')).toBe(3);
    });
    it('matches despite different indentation in the snippet', () => {
        expect((0, lineMatch_1.findMatchingLine)(lines, '        setState(() { _data = result; });')).toBe(3);
    });
    it('uses the first line of a multi-line snippet to find position', () => {
        const snippet = 'setState(() { _data = result; });\n  }';
        expect((0, lineMatch_1.findMatchingLine)(lines, snippet)).toBe(3);
    });
    it('returns 0 when the snippet is empty', () => {
        expect((0, lineMatch_1.findMatchingLine)(lines, '')).toBe(0);
    });
    it('returns 0 when no match found', () => {
        expect((0, lineMatch_1.findMatchingLine)(lines, 'this line absolutely does not exist')).toBe(0);
    });
    it('returns 0 when document has no lines', () => {
        expect((0, lineMatch_1.findMatchingLine)([], 'setState(() { });')).toBe(0);
    });
});
//# sourceMappingURL=lineMatch.test.js.map