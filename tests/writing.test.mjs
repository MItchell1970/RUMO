import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { checkWriting } from '../dist/writing.js';

const base = new URL('../dist/', import.meta.url);
const source = await fs.readFile(new URL('writing-worker.js', base), 'utf8');
const typo = await fs.readFile(new URL('vendor/typo.js', base), 'utf8');
const fetched = [];
let onMessage;
let nextResult;
const sandbox = vm.createContext({ URL, Set, Map, console,
  fetch: async (url) => {
    fetched.push(url.href);
    assert.ok(url.href.startsWith(new URL('vendor/', base).href), 'fetch is restricted to bundled dictionaries');
    return { ok: true, text: () => fs.readFile(url, 'utf8') };
  },
  self: {
    location: { href: new URL('writing-worker.js', base).href },
    addEventListener: (_type, handler) => { onMessage = handler; },
    postMessage: (message) => { nextResult(message.result); },
  },
  importScripts: (path) => {
    assert.equal(path, './vendor/typo.js');
    vm.runInContext(typo, sandbox);
  },
});
vm.runInContext(source, sandbox);
async function check(text, ignoredWords = []) {
  return new Promise((resolve) => {
    nextResult = resolve;
    onMessage({ data: { id: 1, text, ignoredWords } });
  });
}

test('PT-PT dictionary recognises correct spelling and suggests corrections for actual typos', async () => {
  const start = performance.now();
  const result = await check('economia, responsabilidade e experiência; responsablidade e experiênçia.');
  assert.equal(result.ready, true);
  assert.deepEqual(Array.from(result.issues, (issue) => issue.word), ['responsablidade', 'experiênçia']);
  assert.ok(result.issues[0].suggestions.includes('responsabilidade'));
  assert.ok(result.issues[1].suggestions.includes('experiência'));
  assert.ok(performance.now() - start < 10000, 'bounded suggestions should finish well within the browser timeout');
});

test('Portugal vocabulary, software, names, acronyms, URLs and emails do not produce false errors', async () => {
  const result = await check('Formação académica: licenciatura em Economia. Projetos, equipa e objetivos. Maria Kozlovska, Excel, Python, SQL, PowerBI, ReactJS, HTML5. maria@responsablidade.example https://example.com/experiênçia www.example.com/zzz github.com/mispelt.');
  assert.equal(result.ready, true);
  assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
  assert.equal(fetched.length, 2, 'the worker keeps its loaded dictionary');
});

test('capitalised CV headings still get relevant suggestions', async () => {
  const result = await check('Experiênçia profissional. RESPONSABLIDADE');
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues[0].suggestions.includes('Experiência'));
  assert.ok(result.issues[1].suggestions.includes('RESPONSABILIDADE'));
});

test('punctuation and repeated words retain original offsets, including accented words', async () => {
  const text = '📌 experiência experiência; será será. Gestão , economia.';
  const result = await check(text);
  const issues = result.issues.filter((issue) => issue.kind === 'punctuation');
  assert.equal(issues.length, 3);
  for (const issue of issues) assert.equal(text.slice(issue.offset, issue.offset + issue.length), issue.word);
  assert.ok(issues.some((issue) => issue.word === 'será será'));
});

test('word repetition does not match a suffix inside a longer word', async () => {
  const text = 'Todos os dados e atividades deste exemplo são fictícios. Trabalho de análise e gestão de dados.';
  const result = await check(text);
  assert.equal(result.issues.filter((issue) => issue.kind === 'punctuation').length, 0);
  assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
  const repeated = await check('Todos os os dados são fictícios.');
  assert.equal(repeated.issues.filter((issue) => issue.kind === 'punctuation').length, 1);
  assert.equal(repeated.issues.find((issue) => issue.kind === 'punctuation').word, 'os os');
  assert.equal(repeated.issues.find((issue) => issue.kind === 'punctuation').offset, 6);
});

test('user-confirmed technical terms are ignored without changing the bundled dictionary', async () => {
  assert.ok((await check('xylophonium')).issues.length > 0);
  assert.equal((await check('xylophonium', ['xylophonium'])).issues.length, 0);
  assert.ok((await check('xylophonium')).issues.length > 0);
});

test('unrecognised words are described as uncertain and issue count is bounded', async () => {
  const text = Array.from({ length: 70 }, (_, index) => `zzzz${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`).join(' ');
  const result = await check(text);
  assert.equal(result.ready, true);
  assert.equal(result.issues.length, 40);
  assert.equal(result.limited, true);
  assert.match(result.issues[20].message, /nome próprio.*termo técnico/);
});

test('invalid input and unavailable browser worker never masquerade as a successful review', async () => {
  assert.equal((await check('a'.repeat(30001))).ready, false);
  assert.equal((await checkWriting('economia')).ready, false);
  assert.equal((await checkWriting('a'.repeat(30001))).ready, false);
  assert.equal((await checkWriting(null)).ready, false);
});

test('dictionary loading failure is reported and a later attempt can recover', async () => {
  vm.runInContext('dictionaryPromise = undefined;', sandbox);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = async () => ({ ok: false });
  const failed = await check('economia');
  assert.equal(failed.ready, false);
  assert.match(failed.error, /dicionário/);
  sandbox.fetch = originalFetch;
  const recovered = await check('economia');
  assert.equal(recovered.ready, true);
  assert.equal(recovered.issues.length, 0);
});

test('a long text at the input limit remains bounded and has accurate issue offsets', async () => {
  const text = ('economia experiência responsabilidade responsablidade '.repeat(1000)).slice(0, 30000);
  const start = performance.now();
  const result = await check(text);
  assert.equal(result.ready, true);
  assert.ok(result.issues.some((issue) => issue.word === 'responsablidade'));
  for (const issue of result.issues) assert.equal(text.slice(issue.offset, issue.offset + issue.length), issue.word);
  assert.ok(performance.now() - start < 5000);
});
