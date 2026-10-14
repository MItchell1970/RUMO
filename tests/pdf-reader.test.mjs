import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdfMetadata, readCVFile } from '../dist/pdf-reader.js';

const run = (str, size, extra = {}) => ({ str, transform: [size, 0, 0, size, 50, 700], ...extra });

test('font metrics are weighted by non-whitespace characters, not by number of PDF runs', () => {
  const pages = [{ items: [run('a'.repeat(90), 12), ...Array.from({ length: 10 }, () => run('a ', 8)), run('    ', 5)] }];
  assert.deepEqual(getPdfMetadata(pages), { pageCount: 1, bodyFontSize: 12, smallTextRatio: 0.1 });
});

test('font size uses the rotated text transform and page user unit, ignoring misleading item.height', () => {
  const pages = [{ userUnit: 2, items: [run('texto', 5.5, { transform: [0, 5.5, -5.5, 0, 50, 700], height: 70 })] }];
  assert.deepEqual(getPdfMetadata(pages), { pageCount: 1, bodyFontSize: 11, smallTextRatio: 0 });
});

test('the small-text threshold is strictly below ten points and median spans every page', () => {
  const pages = [{ items: [run('ab', 9.5), run('ab', 10)] }, { items: [run('abcde', 11)] }];
  assert.deepEqual(getPdfMetadata(pages), { pageCount: 2, bodyFontSize: 11, smallTextRatio: 2 / 9 });
});

test('missing geometry produces unknown metrics rather than a reassuring zero', () => {
  const pages = [{ items: [{ str: 'texto' }, run('texto', 0), run('texto', NaN), { type: 'beginMarkedContent' }] }];
  assert.deepEqual(getPdfMetadata(pages), { pageCount: 1, bodyFontSize: null, smallTextRatio: null });
  assert.deepEqual(getPdfMetadata([]), { pageCount: 0, bodyFontSize: null, smallTextRatio: null });
});

test('unicode characters and whitespace are counted consistently', () => {
  const pages = [{ items: [run('á é\u00a0í', 12), run('a\u0301', 8)] }];
  assert.deepEqual(getPdfMetadata(pages), { pageCount: 1, bodyFontSize: 12, smallTextRatio: 0.25 });
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
