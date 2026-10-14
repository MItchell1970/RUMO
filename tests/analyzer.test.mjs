import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCV, exampleCV } from '../dist/analyzer.js';

const check = (result, id) => result.checks.find(item => item.id === id);
const fullCV = exampleCV
  .replace('A minha responsabilidade foi verificar a consistência das tabelas e organizar as tarefas do grupo.', 'A minha responsabilidade foi verificar a consistência das tabelas e organizar as tarefas do grupo. Analisei as despesas e apresentei as conclusões num relatório.')
  .replace('\nExcel\n', '\nExcel: organização de dados, fórmulas e criação de gráficos.\n');
const readyOptions = { writingReady: true, confirmations: { grammarReviewed: true, layoutReviewed: true } };

test('texto vazio, curto e valores não textuais recebem um erro compreensível', () => {
  for (const text of ['', 'O meu CV', undefined, null, 123]) assert.throws(() => analyzeCV(text), /40 palavras/);
});

test('repetições e números sem conteúdo não produzem uma avaliação', () => {
  for (const text of ['teste '.repeat(80), '12345 '.repeat(80)]) assert.throws(() => analyzeCV(text), /repetido/);
  assert.throws(() => analyzeCV('! '.repeat(80)), /40 palavras/);
});

test('limites de tamanho e tipos são validados', () => {
  assert.throws(() => analyzeCV('a'.repeat(30001)), /30 000 caracteres/);
  assert.throws(() => analyzeCV(exampleCV, {jobText: 'a'.repeat(30001)}), /30 000 caracteres/);
  assert.throws(() => analyzeCV(exampleCV, {jobText: {}}), /deve ser texto/);
  assert.throws(() => analyzeCV(exampleCV, []), /opções/);
});

test('o exemplo tem margem concreta de melhoria e não nasce com cem pontos', () => {
  const result = analyzeCV(exampleCV);
  assert.ok(result.score >= 60 && result.score <= 80);
  assert.equal(result.checks.length, 9);
  assert.ok(result.improvements.some(item => item.id === 'evidence'));
  assert.ok(result.improvements.some(item => item.id === 'skills'));
  assert.match(exampleCV, /@rumo\.example/);
  assert.match(exampleCV, /fictícios/);
});

test('um CV completo atinge cem com verificações e confirmações explícitas', () => {
  const result = analyzeCV(fullCV, readyOptions);
  assert.equal(result.score, 100);
  assert.equal(result.improvements.length, 0);
  assert.equal(result.strengths.length, 9);
});

test('os nove pesos somam cem e todos os ganhos em falta fecham exatamente a diferença', () => {
  for (const [text, options] of [[exampleCV, {}], [fullCV, readyOptions], [fullCV, {writingReady: true}], [exampleCV, {pdfMeta: {pageCount: 4, bodyFontSize: 8}}]]) {
    const result = analyzeCV(text, options);
    assert.equal(result.score, result.checks.reduce((sum, item) => sum + item.points, 0));
    assert.equal(result.checks.reduce((sum, item) => sum + item.maxPoints, 0), 100);
    assert.equal(result.improvements.reduce((sum, item) => sum + item.gain, 0), 100 - result.score);
    assert.ok(result.score >= 0 && result.score <= 100);
    for (const item of result.checks) {
      assert.ok(item.points >= 0 && item.points <= item.maxPoints);
      assert.equal(item.status, item.points === item.maxPoints ? 'found' : 'review');
      assert.ok(['automatic', 'confirmation', 'mixed'].includes(item.source));
      assert.ok(item.evidence.length && item.suggestion.length);
    }
  }
});

test('as melhorias têm exemplos, identificadores estáveis e maiores ganhos primeiro', () => {
  const result = analyzeCV(exampleCV);
  assert.equal(new Set(result.improvements.map(item => item.id)).size, result.improvements.length);
  for (let i = 0; i < result.improvements.length; i++) {
    const item = result.improvements[i];
    assert.ok(item.title && item.description && item.example && item.gain > 0);
    assert.ok(['content', 'writing', 'layout'].includes(item.kind));
    if (i) assert.ok(result.improvements[i - 1].gain >= item.gain);
  }
});

test('maiúsculas e acentos não mudam a pontuação', () => {
  const unaccented = fullCV.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  assert.equal(analyzeCV(unaccented, readyOptions).score, 100);
});

test('títulos vazios não validam formação, projetos ou competências citados apenas no perfil', () => {
  const text = `Perfil\nEstudante de Economia com interesse em projetos, Excel e análise de dados. Procuro uma primeira oportunidade para aplicar conhecimentos da licenciatura e explorar novas perspetivas. Valorizo a comunicação entre colegas, a aprendizagem autónoma e a descoberta de novas formas de trabalhar em conjunto.\nFormação\nProjetos\nCompetências`;
  const result = analyzeCV(text);
  assert.equal(check(result, 'education').points, 0);
  assert.equal(check(result, 'experience').points, 0);
  assert.equal(check(result, 'skills').points, 0);
  assert.equal(check(result, 'structure').points, 5);
});

test('secções repetidas não somam e títulos com conteúdo na mesma linha funcionam', () => {
  const result = analyzeCV(fullCV.replace('Formação académica\n', 'Formação académica: ').replace('Competências\n', 'Competências: '), readyOptions);
  assert.equal(result.score, 100);
  const repeated = `Perfil\nPerfil\nPerfil\nSou estudante de Economia com interesse em temas económicos e procuro aprender através do contacto com diferentes ideias. Gosto de explorar perspetivas, comparar opiniões e debater os conhecimentos das aulas com colegas. Valorizo a curiosidade, a aprendizagem e a capacidade de compreender assuntos novos.`;
  assert.equal(check(analyzeCV(repeated), 'structure').points, 5);
});

test('projetos académicos cumprem experiência sem emprego anterior', () => {
  const result = analyzeCV(fullCV.replace('primeiro estágio', 'primeiro desafio'), readyOptions);
  assert.equal(check(result, 'experience').points, 15);
  assert.equal(result.score, 100);
});

test('voluntariado também demonstra experiência', () => {
  const cv = fullCV.replace('Projetos académicos', 'Voluntariado').replace('Custo de vida — projeto de grupo, 2026', 'Iniciativa de apoio ao estudo, 2026');
  assert.equal(check(analyzeCV(cv), 'experience').points, 15);
});

test('uma entrega concreta vale sem exigir números nem percentagens', () => {
  const result = analyzeCV(fullCV.replaceAll(/\d+/g, ''), readyOptions);
  assert.equal(check(result, 'evidence').points, 10);
  assert.match(check(result, 'evidence').evidence, /relatório/);
});

test('datas isoladas não se tornam resultados e palavras contidas noutras não são ferramentas', () => {
  const cv = exampleCV.replace('\nExcel\n', '\nPessoa excelente, digital e organizada\n');
  const result = analyzeCV(cv, 'Excel SQL Git');
  assert.equal(check(result, 'evidence').points, 0);
  assert.equal(check(result, 'skills').points, 0);
  assert.deepEqual(result.keywords.matched, []);
  assert.deepEqual(result.keywords.missing, ['excel', 'sql', 'git']);
});

test('contacto não exige telefone, fotografia ou morada', () => {
  assert.equal(check(analyzeCV(exampleCV), 'contact').points, 10);
  assert.equal(check(analyzeCV(exampleCV.replace('estudante@rumo.example', 'Contactar pessoalmente')), 'contact').points, 0);
});

test('falha ou espera do dicionário nunca aprova a ortografia', () => {
  for (const options of [{}, {writingReady: false}, {writingReady: 'true'}]) {
    const writing = check(analyzeCV(fullCV, options), 'writing');
    assert.equal(writing.points, 0);
    assert.match(writing.evidence, /Ortografia: 0\/9/);
    assert.match(writing.evidence, /indisponível/);
  }
});

test('ortografia automática sem alertas vale nove, gramática exige confirmação', () => {
  const result = analyzeCV(fullCV, {writingReady: true});
  assert.equal(check(result, 'writing').points, 12);
  assert.match(check(result, 'writing').evidence, /Gramática: 0\/3/);
  assert.equal(check(result, 'writing').source, 'automatic');
});

test('falha de verificação não aprova pontuação; revisão de gramática e pontuação pode confirmá-la', () => {
  const unavailable = check(analyzeCV(fullCV, {writingReady:false}), 'writing');
  assert.equal(unavailable.points, 0);
  assert.match(unavailable.evidence, /Pontuação: 0\/3 \(verificação indisponível/);
  const reviewed = check(analyzeCV(fullCV, {writingReady:false,confirmations:{grammarReviewed:true}}), 'writing');
  assert.equal(reviewed.points, 6);
  assert.match(reviewed.evidence, /Pontuação: 3\/3 \(revisão confirmada por ti/);
  const knownIssue = check(analyzeCV(fullCV, {writingReady:false,writingIssues:[{kind:'punctuation'}],confirmations:{grammarReviewed:true}}), 'writing');
  assert.equal(knownIssue.points, 3);
});

test('alertas ortográficos reduzem nove pontos e produzem sugestão concreta', () => {
  const options = {writingReady: true, writingIssues: [{id:'s1', word:'analizei', kind:'spelling', message:'Confirma a grafia.', suggestions:['analisei']}]};
  const writing = check(analyzeCV(fullCV, options), 'writing');
  assert.equal(writing.points, 3);
  assert.match(writing.example, /analizei/);
  assert.match(writing.example, /analisei/);
});

test('alertas de pontuação retiram só os três pontos de pontuação', () => {
  const writing = check(analyzeCV(fullCV, {writingReady:true, writingIssues:[{id:'p1',kind:'punctuation',word:'..',message:'Revê os pontos.',suggestions:['.']}]}), 'writing');
  assert.equal(writing.points, 9);
  assert.match(writing.evidence, /Pontuação: 0\/3/);
});

test('revisão manual de ortografia permite confirmar termos desconhecidos e falha de dicionário', () => {
  const result = analyzeCV(fullCV, {writingReady:false, writingIssues:[{kind:'spelling',word:'NomePróprio'}], confirmations:{spellingReviewed:true,grammarReviewed:true}});
  const writing = check(result, 'writing');
  assert.equal(writing.points, 15);
  assert.equal(writing.source, 'confirmation');
  assert.match(writing.evidence, /revisão confirmada por ti/);
});

test('confirmações requerem o booleano true e não são inferidas de texto', () => {
  const result = analyzeCV(fullCV, {confirmations:{spellingReviewed:'true',grammarReviewed:1,layoutReviewed:'sim'}});
  assert.equal(check(result, 'writing').points, 0);
  assert.equal(check(result, 'layout').points, 0);
});

test('texto colado só ganha apresentação após revisão visual explícita', () => {
  const unreviewed = check(analyzeCV(fullCV), 'layout');
  const reviewed = check(analyzeCV(fullCV, {confirmations:{layoutReviewed:true}}), 'layout');
  assert.equal(unreviewed.points, 0);
  assert.equal(reviewed.points, 10);
  assert.equal(reviewed.source, 'confirmation');
  assert.match(reviewed.evidence, /não é uma validação automática/);
});

test('PDF legível tem sete pontos automáticos e três pela revisão visual', () => {
  const pdfMeta = {pageCount:2, bodyFontSize:10, smallTextRatio:0.3};
  assert.equal(check(analyzeCV(fullCV, {pdfMeta}), 'layout').points, 7);
  const reviewed = check(analyzeCV(fullCV, {pdfMeta, confirmations:{layoutReviewed:true}}), 'layout');
  assert.equal(reviewed.points, 10);
  assert.equal(reviewed.source, 'mixed');
});

test('a razão de texto pequeno pode satisfazer o critério mesmo sem tamanho de corpo', () => {
  assert.equal(check(analyzeCV(fullCV, {pdfMeta:{pageCount:1,smallTextRatio:0.15}}), 'layout').points, 7);
  assert.equal(check(analyzeCV(fullCV, {pdfMeta:{pageCount:1,smallTextRatio:0.151}}), 'layout').points, 3);
});

test('PDF extenso ou letra pequena perde os pontos correspondentes', () => {
  const result = analyzeCV(fullCV, {pdfMeta:{pageCount:3,bodyFontSize:8,smallTextRatio:0.8},confirmations:{layoutReviewed:true}});
  assert.equal(check(result, 'layout').points, 3);
  assert.equal(result.improvements.find(item => item.id === 'layout').gain, 7);
});

test('metadados inválidos não se transformam em aprovações', () => {
  for (const pdfMeta of [{}, {pageCount:0,bodyFontSize:NaN,smallTextRatio:-1}, {pageCount:'1',bodyFontSize:Infinity,smallTextRatio:2}]) {
    const layout = check(analyzeCV(fullCV, {pdfMeta}), 'layout');
    assert.equal(layout.points, 0);
    assert.ok(!layout.evidence.includes('NaN'));
  }
});

test('palavras-chave mantêm compatibilidade, acentos, deduplicação e palavras genéricas excluídas', () => {
  const jobText = 'Procuramos uma pessoa para a equipa com formação e experiência. Excel EXCEL, ANÁLISE analise, SQL SQL e Python.';
  const legacy = analyzeCV(exampleCV, jobText);
  const current = analyzeCV(exampleCV, {jobText});
  assert.deepEqual(legacy.keywords, current.keywords);
  assert.deepEqual(current.keywords.matched, ['excel', 'análise']);
  assert.deepEqual(current.keywords.missing, ['sql', 'python']);
  assert.equal(current.score, analyzeCV(exampleCV).score);
  assert.deepEqual(analyzeCV(exampleCV).keywords, {matched:[],missing:[]});
});

test('entregas concisas contam com contexto, sem aprovar frases vagas', () => {
  const insert = sentence => exampleCV.replace('A minha responsabilidade foi', sentence + ' A minha responsabilidade foi');
  for (const sentence of ['Apresentei as conclusões num relatório.', 'Produzi um relatório comparativo.']) {
    assert.equal(check(analyzeCV(insert(sentence)), 'evidence').points, 10);
  }
  for (const sentence of ['Criei site.', '2024 2025 2026.']) {
    assert.equal(check(analyzeCV(insert(sentence)), 'evidence').points, 0);
  }
});
