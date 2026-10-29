import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from '../dist/vendor/pdf-lib.min.mjs';
import { createCVPdf, wrapPdfText } from '../dist/pdf-export.js';
import { readCVFile } from '../dist/pdf-reader.js';
import { analyzeCV } from '../dist/analyzer.js';

// PDF.js uses these browser APIs during text/operator extraction. Visual QA is
// performed separately with a real renderer; this shim does not paint a page.
globalThis.DOMMatrix ||= class DOMMatrix {};
globalThis.Path2D ||= class Path2D {};
Uint8Array.prototype.toHex ||= function () { return Buffer.from(this).toString('hex'); };
Map.prototype.getOrInsertComputed ||= function (key, create) { if (!this.has(key)) this.set(key, create(key)); return this.get(key); };
const readExport = result => readCVFile({ name: result.filename, size: result.bytes.length, arrayBuffer: async () => result.bytes.slice().buffer });

const sample = {
  name: 'Ana Inês Gonçalves', headline: 'Estudante de Economia', contact: 'ana@example.pt | Lisboa',
  profile: 'Estudante de Economia com interesse em investigação e análise de dados.',
  education: 'Licenciatura em Economia\nUniversidade de Lisboa | 2023 - 2026',
  experience: 'Projeto académico de estatística\nAnalisei 120 observações e apresentei um relatório com resultados.',
  skills: 'Excel · Python · Inglês B2', extra: '',
};

test('exports the single Word-based Rumo template on Letter pages', async () => {
  const result = await createCVPdf(sample);
  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF');
  assert.equal(result.pageCount, 1);
  assert.equal(result.filename, 'CV-Ana-Ines-Goncalves.pdf');
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getTitle(), 'Currículo - Ana Inês Gonçalves');
  assert.deepEqual(doc.getPage(0).getSize(), { width: 612, height: 792 });
  assert.equal(result.template, 'rumo');
  assert.equal(result.fitInfo.bodyFontSize, 12);
  assert.equal(result.fitInfo.contentPreserved, true);
});
test('long content paginates, without a page-count cap that silently truncates facts', async () => {
  const result = await createCVPdf({ ...sample, experience: Array.from({ length: 160 }, (_, index) => `Linha ${index}: Coordenei a análise e descrevi a conclusão do projeto académico.`).join('\n') });
  assert.ok(result.pageCount > 3);
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), result.pageCount);
  const extracted = await readExport(result);
  for (let index = 0; index < 160; index++) assert.ok(extracted.text.includes(`Linha ${index}:`));
});

test('the reference template preserves paired facts and passes measured layout checks', async () => {
  const model = { ...sample,
    contact: 'Lisboa, Portugal\nana@example.pt\t+351 910 000 000',
    education: 'Universidade Exemplo\tLisboa, Portugal\nLicenciatura em Economia\t2023 - 2026',
    experience: 'Empresa Exemplo\tPorto, Portugal\nEstágio em análise financeira\t2025 - 2026\n• Analisei 120 observações e apresentei um relatório com resultados.\n\nLEADERSHIP\nAssociação de Estudantes\tLisboa\nCoordenadora de projetos\t2024 - 2025\n• Organizei três eventos para 40 participantes.',
    extra: 'Interesses\tEconomia, leitura e corrida',
  };
  const result = await createCVPdf(model, { template: 'rumo' });
  const read = await readExport(result);
  const tokenise = text => text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
  const expected = tokenise(Object.values(model).join('\n'));
  const actual = new Map();
  for (const word of tokenise(read.text)) actual.set(word, (actual.get(word) || 0) + 1);
  for (const word of expected) { assert.ok(actual.get(word) > 0, `Missing factual token: ${word}`); actual.set(word, actual.get(word) - 1); }
  assert.equal(read.metadata.bodyFontSize, 12);
  assert.equal(read.metadata.fontFamilyCount, 1);
  assert.equal(read.metadata.tightLineRatio, 0);
  assert.ok(read.metadata.minMarginPt >= 35.9);
  const layout = analyzeCV(read.text, { pdfMeta: read.metadata }).checks.filter(check => check.group === 'layout');
  assert.equal(layout.reduce((sum, check) => sum + check.points, 0), 15);
});
test('unsupported characters fail explicitly rather than losing user names', async () => {
  await assert.rejects(createCVPdf({ name: 'Ana 😀' }), /não suporta.*U\+1F600/);
  await assert.rejects(createCVPdf({ name: '李明' }), /não suporta/);
});

test('additional-information skill labels survive PDF extraction and scoring', async () => {
  const model = { ...sample, skills: 'Excel: análise e apresentação de dados económicos em relatórios.' };
  const pdf = await createCVPdf(model);
  const imported = await readExport(pdf);
  assert.match(imported.text, /Excel:/);
  const skills = analyzeCV(imported.text).checks.find(check => check.id === 'skills');
  assert.equal(skills.points, 10);
});
test('rejects empty documents and unknown templates', async () => {
  await assert.rejects(createCVPdf({}), /Preenche/);
  await assert.rejects(createCVPdf(sample, { template: 'invented' }), /modelo/);
  await assert.rejects(createCVPdf(sample, { template: 'minimal' }), /modelo/);
});

test('fits a moderately long CV before adding a page, with a readable minimum', async () => {
  const result = await createCVPdf({ name: 'Ana Silva', experience: Array.from({ length: 55 }, (_, i) => `• Projeto ${i}: analisei dados económicos.`).join('\n') });
  assert.equal(result.pageCount, 1);
  assert.ok(result.fitInfo.bodyFontSize >= 10 && result.fitInfo.bodyFontSize < 12);
  assert.equal(result.fitInfo.compactSpacing, true);
});

test('oversized CVs keep readable type and every page instead of shrinking indefinitely', async () => {
  const result = await createCVPdf({ name: 'Ana Silva', experience: Array.from({ length: 180 }, (_, i) => `• Projeto ${i}: analisei dados económicos.`).join('\n') });
  assert.ok(result.pageCount >= 3);
  assert.equal(result.fitInfo.bodyFontSize, 12);
  assert.equal(result.fitInfo.contentPreserved, true);
});
test('word wrapping never loses long unbroken text', () => {
  const fakeFont = { widthOfTextAtSize: text => [...text].length };
  const token = 'abcde'.repeat(45);
  const wrapped = wrapPdfText(`Olá\n${token}\n\nFim`, fakeFont, 11, 20);
  assert.equal(wrapped.filter(line => /^abc|^[abcde]+$/.test(line)).join(''), token);
  assert.ok(wrapped.every(line => [...line].length <= 20));
  assert.ok(wrapped.includes(''));
  assert.equal(wrapped.at(-1), 'Fim');
});
