import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from '../dist/vendor/pdf-lib.min.mjs';
import { createCVPdf, wrapPdfText } from '../dist/pdf-export.js';

const sample = {
  name: 'Ana Inês Gonçalves', headline: 'Estudante de Economia', contact: 'ana@example.pt | Lisboa',
  profile: 'Estudante de Economia com interesse em investigação e análise de dados.',
  education: 'Licenciatura em Economia\nUniversidade de Lisboa | 2023 - 2026',
  experience: 'Projeto académico de estatística\nAnalisei 120 observações e apresentei um relatório com resultados.',
  skills: 'Excel · Python · Inglês B2', extra: '',
};

for (const template of ['minimal', 'classic']) test(`exports a real A4 PDF using ${template} template`, async () => {
  const result = await createCVPdf(sample, { template });
  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF');
  assert.equal(result.pageCount, 1);
  assert.equal(result.filename, 'CV-Ana-Ines-Goncalves.pdf');
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getTitle(), 'Currículo - Ana Inês Gonçalves');
  assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
});
test('long content paginates, without a page-count cap that silently truncates facts', async () => {
  const result = await createCVPdf({ ...sample, experience: Array.from({ length: 160 }, (_, index) => `Linha ${index}: Coordenei a análise e descrevi a conclusão do projeto académico.`).join('\n') });
  assert.ok(result.pageCount > 3);
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), result.pageCount);
});
test('unsupported characters fail explicitly rather than losing user names', async () => {
  await assert.rejects(createCVPdf({ name: 'Ana 😀' }), /não suporta.*U\+1F600/);
  await assert.rejects(createCVPdf({ name: '李明' }), /não suporta/);
});
test('rejects empty documents and unknown templates', async () => {
  await assert.rejects(createCVPdf({}), /Preenche/);
  await assert.rejects(createCVPdf(sample, { template: 'invented' }), /modelos/);
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
