import test from 'node:test';
import assert from 'node:assert/strict';
import { CV_FIELDS, parseCV, normalizeModel, serializeCV, detectCVLanguage } from '../dist/cv-model.js';

test('empty content stays empty, without fabricated names or facts', () => {
  assert.deepEqual(Object.keys(parseCV('')), CV_FIELDS);
  assert.ok(Object.values(parseCV('')).every(value => value === ''));
  assert.equal(serializeCV({}), '');
});

test('uppercase employers, acronyms and tool labels retain their section context', () => {
  const model = parseCV('Experiência\nBANCO BPI\nEstágio 2025\nElaborei um relatório.\nCompetências\nSQL\nExcel:\nAnálise de dados e tabelas.');
  assert.match(model.experience, /BANCO BPI\nEstágio 2025\nElaborei/);
  assert.match(model.skills, /SQL\nExcel:\nAnálise/);
  assert.equal(model.extra, '');
});
test('parses PT-PT sections and merges projects without discarding their context', () => {
  const model = parseCV('Ana Inês Silva\nEstudante de Economia\nana@example.com | +351 912 345 678\nPerfil\nEstudante interessada em análise de dados.\nFormação académica\nLicenciatura em Economia - Universidade de Lisboa - 2024\nExperiência profissional\nEstágio no banco local - 2025\nProjetos académicos\nAnalisei dados e apresentei um relatório.\nCompetências\nExcel, Python\nIdiomas\nInglês B2');
  assert.equal(model.name, 'Ana Inês Silva');
  assert.equal(model.headline, 'Estudante de Economia');
  assert.match(model.contact, /ana@example/);
  assert.match(model.experience, /Estágio/);
  assert.match(model.experience, /Projetos académicos\nAnalisei/);
  assert.match(model.skills, /Idiomas\nInglês B2/);
});
test('unclassified text is preserved and no name inferred from education or role', () => {
  const model = parseCV('Estudante de Economia\nUniversidade do Porto\nApontamentos pessoais:\nDisponível aos sábados.\nTexto que não deve desaparecer.');
  assert.equal(model.name, '');
  for (const line of ['Estudante de Economia', 'Universidade do Porto', 'Apontamentos pessoais:', 'Disponível aos sábados.', 'Texto que não deve desaparecer.']) assert.ok(model.extra.includes(line));
});
test('inline and English headings preserve supplied values', () => {
  const model = parseCV('Profile: Data analyst\nEducation: MSc Economics\nProjects: Research report\nSkills: R, SQL\nReferences: Available on request');
  assert.equal(model.profile, 'Data analyst');
  assert.equal(model.education, 'MSc Economics');
  assert.match(model.experience, /Research report/);
  assert.equal(model.skills, 'R, SQL');
  assert.equal(model.extra, 'Available on request');
});
test('normalization accepts only strings and serialization preserves values in field order', () => {
  const input = Object.fromEntries(CV_FIELDS.map((field, index) => [field, `Value ${index}\nSecond line ${index}`]));
  const text = serializeCV(input);
  let offset = -1;
  for (const field of CV_FIELDS) { const next = text.indexOf(input[field]); assert.ok(next > offset); offset = next; }
  assert.equal(normalizeModel({ name: 42, contact: '  a@b.pt  \r\n Porto  ' }).name, '');
  assert.equal(normalizeModel({ contact: '  a@b.pt  \r\n Porto  ' }).contact, 'a@b.pt\nPorto');
});
test('all freeform lines survive parse and serialize even with unfamiliar headings', () => {
  const original = 'João Oliveira\nContacto: joao@example.pt\nPerfil\nTexto livre com 3 números e & caracteres.\nBOLSAS\nBolsa de estudo com apoio integral.\nFormação\nMestrado 2025\nInvestigação especial:\nNota privada do próprio autor.';
  const text = serializeCV(parseCV(original));
  for (const fragment of ['João Oliveira', 'joao@example.pt', 'Texto livre com 3 números e & caracteres.', 'BOLSAS', 'Bolsa de estudo com apoio integral.', 'Mestrado 2025', 'Investigação especial:', 'Nota privada do próprio autor.']) assert.ok(text.includes(fragment), fragment);
});

test('English finance format preserves identity, paired dates and separate voluntary headings', () => {
  const text = 'ANA COSTA\tLisbon, Portugal\nana@example.pt\t+351 912 345 678\nEDUCATION\nExample University\tPorto, Portugal\nBachelor in Economics\t2023 - 2026\nWORK EXPERIENCE\nEXAMPLE BANK\tLondon\nAnalyst intern\t2025\nAnalysed economic data and delivered a report.\nLEADERSHIP\nStudent society coordinator\nVOLUNTARY WORK\nOrganised training for volunteers.\nADDITIONAL INFORMATION\nSkills: Excel and financial modeling\nCertifications: English certificate\nInterests: swimming';
  const model = parseCV(text);
  assert.equal(model.name,'ANA COSTA');
  assert.match(model.contact,/Lisbon, Portugal/);
  assert.match(model.contact,/ana@example.pt\t\+351/);
  assert.match(model.education,/Bachelor in Economics\t2023 - 2026/);
  assert.match(model.experience,/LEADERSHIP\nStudent society/);
  assert.match(model.experience,/VOLUNTARY WORK\nOrganised/);
  assert.match(model.extra,/Skills: Excel/);assert.match(model.extra,/Certifications: English/);
  assert.equal(detectCVLanguage(text),'en');
  assert.match(serializeCV(model),/Education\n/);
});
