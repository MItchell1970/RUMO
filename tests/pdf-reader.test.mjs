import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdfMetadata, readCVFile } from '../dist/pdf-reader.js';

const run = (str, size, extra = {}) => ({ str, transform: [size, 0, 0, size, 50, 700], ...extra });
const metadata = (known) => ({ pageCount: 1, bodyFontSize: null, smallTextRatio: null, minMarginPt: null, tightLineRatio: null, textDensity: null, fontFamilyCount: null, ...known });

test('font metrics are weighted by non-whitespace characters, not by number of PDF runs', () => {
  const pages = [{ items: [run('a'.repeat(90), 12), ...Array.from({ length: 10 }, () => run('a ', 8)), run('    ', 5)] }];
  assert.deepEqual(getPdfMetadata(pages), metadata({ bodyFontSize: 12, smallTextRatio: 0.1 }));
});

test('font size uses the rotated text transform and page user unit, ignoring misleading item.height', () => {
  const pages = [{ userUnit: 2, items: [run('texto', 5.5, { transform: [0, 5.5, -5.5, 0, 50, 700], height: 70 })] }];
  assert.deepEqual(getPdfMetadata(pages), metadata({ bodyFontSize: 11, smallTextRatio: 0 }));
});

test('the small-text threshold is strictly below ten points and median spans every page', () => {
  const pages = [{ items: [run('ab', 9.5), run('ab', 10)] }, { items: [run('abcde', 11)] }];
  assert.deepEqual(getPdfMetadata(pages), metadata({ pageCount: 2, bodyFontSize: 11, smallTextRatio: 2 / 9 }));
});

test('missing geometry produces unknown metrics rather than a reassuring zero', () => {
  const pages = [{ items: [{ str: 'texto' }, run('texto', 0), run('texto', NaN), { type: 'beginMarkedContent' }] }];
  assert.deepEqual(getPdfMetadata(pages), metadata({}));
  assert.deepEqual(getPdfMetadata([]), metadata({ pageCount: 0 }));
});

test('unicode characters and whitespace are counted consistently', () => {
  const pages = [{ items: [run('á é\u00a0í', 12), run('a\u0301', 8)] }];
  assert.deepEqual(getPdfMetadata(pages), metadata({ bodyFontSize: 12, smallTextRatio: 0.25 }));
});

const textItem = (x, y, width = 487, size = 11, extra = {}) => run('Projeto académico: análise de dados e apresentação de resultados.', size, {
  width, height: size, fontName: 'AAAAAA+Inter-Regular', transform: [size, 0, 0, size, x, y], ...extra,
});
const fixture = (packed = false) => ({
  width: 595, height: 842, userUnit: 1,
  items: Array.from({ length: packed ? 75 : 24 }, (_, i) => textItem(packed ? 9 : 54, (packed ? 827 : 779) - i * (packed ? 10 : 15), packed ? 577 : 487, 11,
    { fontName: i % 4 ? 'AAAAAA+Inter-Regular' : 'BBBBBB+Inter-Bold' })),
});
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('clean and packed A4 pages produce distinct margin, line-spacing and density signals', () => {
  const clean = getPdfMetadata([fixture()]);
  const packed = getPdfMetadata([fixture(true)]);
  assert.equal(clean.minMarginPt, 54);
  assert.equal(clean.tightLineRatio, 0);
  near(clean.textDensity, 24 * 487 * 11 / (595 * 842));
  assert.equal(clean.fontFamilyCount, 1);
  assert.equal(packed.minMarginPt, 6.2);
  assert.equal(packed.tightLineRatio, 1);
  assert.ok(packed.textDensity > 0.8);
  assert.ok(clean.textDensity < 0.3);
});

test('fragments and duplicate text on the same baseline neither inflate density nor count as tight lines', () => {
  const items = [textItem(54, 779, 200), textItem(54, 764, 200)];
  const original = getPdfMetadata([{ width: 595, height: 842, items }]);
  const fragmented = getPdfMetadata([{ width: 595, height: 842, items: items.flatMap((item) => [
    { ...item, width: 100 }, { ...item, width: 100, transform: [...item.transform.slice(0, 4), 154, item.transform[5]] }, { ...item },
  ]) }]);
  assert.equal(original.tightLineRatio, 0);
  assert.equal(fragmented.tightLineRatio, 0);
  near(fragmented.textDensity, original.textDensity);
  assert.equal(fragmented.minMarginPt, original.minMarginPt);
});

test('staggered columns are compared along their own reading areas', () => {
  const items = [textItem(54, 700, 180), textItem(320, 695, 180), textItem(54, 685, 180), textItem(320, 680, 180)];
  assert.equal(getPdfMetadata([{ width: 595, height: 842, items }]).tightLineRatio, 0);
});

test('title-to-body transitions are excluded from comparable line spacing', () => {
  const items = [textItem(54, 779, 200, 24), textItem(54, 760, 200, 11), textItem(54, 745, 200, 11)];
  assert.equal(getPdfMetadata([{ width: 595, height: 842, items }]).tightLineRatio, 0);
});

test('quarter-turn text/page rotation preserves geometric metrics', () => {
  const page = fixture();
  const original = getPdfMetadata([page]);
  const rotated = getPdfMetadata([{
    ...page, width: page.height, height: page.width,
    items: page.items.map((item) => {
      const [a, b, c, d, x, y] = item.transform;
      return { ...item, transform: [-b, a, -d, c, page.height - y, x] };
    }),
  }]);
  near(rotated.textDensity, original.textDensity);
  assert.deepEqual({ ...rotated, textDensity: original.textDensity }, original);
});

test('physical units apply once to dimensions, glyph boxes, margins and font size', () => {
  const page = fixture();
  const scaled = {
    ...page, width: page.width / 2, height: page.height / 2, userUnit: 2,
    items: page.items.map((item) => ({ ...item, width: item.width / 2, height: item.height / 2, transform: item.transform.map((value) => value / 2) })),
  };
  assert.deepEqual(getPdfMetadata([scaled]), getPdfMetadata([page]));
});

test('font styles use real family identity rather than PDF resource IDs or fallback names', () => {
  const page = { ...fixture(), items: [textItem(54, 700, 200, 11, { fontName: 'g_d0_f1' }), textItem(54, 685, 200, 11, { fontName: 'g_d0_f2' })] };
  assert.equal(getPdfMetadata([page]).fontFamilyCount, null);
  page.styles = { g_d0_f1: { fontFamily: 'sans-serif', originalFontName: 'ABCDEF+Helvetica' }, g_d0_f2: { fontFamily: 'sans-serif', originalFontName: 'ZYXWVU+Helvetica-Bold' } };
  assert.equal(getPdfMetadata([page]).fontFamilyCount, 1);
  page.styles.g_d0_f2.originalFontName = 'Times-Roman';
  assert.equal(getPdfMetadata([page]).fontFamilyCount, 2);
  delete page.styles.g_d0_f2.originalFontName;
  assert.equal(getPdfMetadata([page]).fontFamilyCount, null);
});

test('style ascent and descent locate boxes relative to baselines', () => {
  const page = { width: 100, height: 100, items: [textItem(20, 90, 60, 10)], styles: { 'AAAAAA+Inter-Regular': { ascent: 0.9, descent: -0.3 } } };
  const result = getPdfMetadata([page]);
  assert.equal(result.minMarginPt, 1);
  near(result.textDensity, 60 * 12 / 10000);
  assert.equal(result.tightLineRatio, null); // No pair of lines to measure.
});

test('incomplete geometry on one text page does not award a whole-document value', () => {
  const missingWidth = { ...fixture(), items: [textItem(54, 700, undefined)] };
  delete missingWidth.items[0].width;
  const result = getPdfMetadata([fixture(), missingWidth]);
  assert.equal(result.minMarginPt, null);
  assert.equal(result.tightLineRatio, null);
  assert.equal(result.textDensity, null);
  const missingFont = getPdfMetadata([{ width: 595, height: 842, items: [textItem(54, 700), { str: 'Texto sem transformação' }] }]);
  assert.equal(missingFont.bodyFontSize, null);
  assert.equal(missingFont.smallTextRatio, null);
  assert.equal(missingFont.fontFamilyCount, null);
});

test('non-orthogonal text keeps margins but leaves box-density and spacing unknown', () => {
  const size = 11;
  const diagonal = size / Math.SQRT2;
  const page = { width: 595, height: 842, items: [textItem(100, 300, 100, size, { transform: [diagonal, diagonal, -diagonal, diagonal, 100, 300] })] };
  const result = getPdfMetadata([page]);
  assert.equal(typeof result.minMarginPt, 'number');
  assert.equal(result.textDensity, null);
  assert.equal(result.tightLineRatio, null);
});

test('text outside page bounds gives zero margin and clipped, bounded density', () => {
  const result = getPdfMetadata([{ width: 100, height: 100, items: [textItem(-10, 50, 120, 10)] }]);
  assert.equal(result.minMarginPt, 0);
  near(result.textDensity, 0.1);
});

test('TXT import keeps Portuguese, normalises line endings and has no invented PDF metadata', async () => {
  const file = new File(['\uFEFFFormação académica\r\nEconomia\r\n'], 'curriculo.TXT', { type: 'text/plain' });
  assert.deepEqual(await readCVFile(file), { text: 'Formação académica\nEconomia', metadata: null, name: 'curriculo.TXT', kind: 'txt' });
});

test('unsupported extensions, empty files, byte limits, text limits and encoding errors are explicit', async () => {
  await assert.rejects(readCVFile(new File(['abc'], 'cv.docx')), /PDF ou TXT/);
  await assert.rejects(readCVFile(new File([], 'cv.txt')), /vazio/);
  await assert.rejects(readCVFile({ name: 'cv.pdf', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  await assert.rejects(readCVFile(new File(['a'.repeat(30001)], 'cv.txt')), /30 000/);
  await assert.rejects(readCVFile(new File(['abc\0def'], 'cv.txt')), /UTF-8/);
  await assert.rejects(readCVFile(new File(['texto simples'], 'cv.pdf')), /PDF válido/);
  await assert.rejects(readCVFile(null), /PDF ou TXT/);
});
