/* Classic worker: only static files below ./vendor/ are requested over the network. */
'use strict';
importScripts('./vendor/typo.js');

let dictionaryPromise;
const MAX_ISSUES = 40;
const MAX_SUGGESTED_WORDS = 10;
const normalizeWord = (word) => word.normalize('NFC').toLocaleLowerCase('pt-PT');
const ALLOWLIST = new Set(`
  cv cvs curriculum vitae linkedin github gitlab excel powerpoint word outlook office
  microsoft google python javascript typescript java html css sql mysql postgresql sqlite
  react vue angular node nodejs npm api apis json xml php ruby kotlin swift rust matlab
  stata spss eviews powerbi tableau sas sap crm erp etl aws azure docker kubernetes
  figma canva notion trello asana slack zoom teams moodle coursera udemy edx
  dashboard dashboards dataset datasets data analytics insights business intelligence
  marketing digital online offline freelance freelancer freelancers workshop workshops
  webinar webinars networking feedback software hardware startup startups bootcamp
  scrum agile kanban sprint sprints backlog stakeholder stakeholders fintech ecommerce
  ux ui seo sem kpi kpis okr okrs b2b b2c saas ia ai machine learning deep learning
  junior júnior sénior senior fullstack backend frontend full stack back front end
  bootstrap tailwind vite webpack vercel netlify githubpages reactjs nextjs pandas numpy
  matplotlib seaborn scipy pytorch tensorflow scikit sklearn jupyter colab svelte
  econometria microeconomia macroeconomia pró-ativo pró-ativa proativo proativa
`.trim().split(/\s+/));

// Ranking only: a candidate still has to be accepted by the PT-PT dictionary.
const CV_VOCABULARY = new Set(`
  experiência experiências formação académica académico académicos profissional profissionais
  competência competências responsabilidade responsabilidades organização comunicação
  licenciatura mestrado universidade faculdade conhecimento conhecimentos objetivo objetivos
  currículo currículos portefólio apresentação candidatura análise gestão finanças
  contabilidade economia econometria investigação desenvolvimento coordenação colaboração
  projeto projetos estágio estágios voluntariado disponibilidade capacidade capacidades
  aprendizagem resultados equipa trabalho contacto contactos certificação certificações
  português inglês francês espanhol educação informação informações informática informática
  estatística estatístico estatísticos financeira financeiro financeiros empresarial
  analisei desenvolvi organizei coordenei elaborei apresentei implementei participei
  preparei colaborei criei realizei acompanhei apoiei trabalhei geri contribuí
  analisar desenvolver organizar coordenar elaborar apresentar implementar participar
  preparar colaborar criar realizar acompanhar apoiar trabalhar gerir contribuir
`.trim().split(/\s+/));

async function getDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = Promise.all(['./vendor/pt-PT.aff', './vendor/pt-PT.dic'].map(async (path) => {
      const response = await fetch(new URL(path, self.location.href));
      if (!response.ok) throw new Error('dictionary unavailable');
      return response.text();
    })).then(([aff, dic]) => {
      if (!aff.startsWith('SET UTF-8') || !/^\d+\s/m.test(dic)) throw new Error('invalid dictionary');
      const dictionary = new Typo('pt_PT', aff, dic);
      if (!dictionary.check('economia') || dictionary.check('responsablidade')) throw new Error('dictionary validation failed');
      return dictionary;
    }).catch((error) => { dictionaryPromise = undefined; throw error; });
  }
  return dictionaryPromise;
}

function protectedRanges(text) {
  // Offsets are kept in the original text, even when a CV contains accents or emoji.
  const pattern = /(?:https?:\/\/|www\.)[^\s<>]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|\b(?:[\p{L}\p{N}-]+\.)+(?:com|pt|org|net|edu|io|dev|app|eu)\b(?:\/[^\s<>]*)?/giu;
  return [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

/** Bounded one-edit suggestions avoid Typo.suggest's expensive two-edit expansion. */
function nearbySuggestions(word, dictionary) {
  if (word.length < 3 || word.length > 28 || /[-’']/u.test(word)) return [];
  const letters = [...word];
  const alphabet = [...'abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúç'];
  const candidates = new Set();
  let checked = 0;
  const visit = (candidate) => {
    if (++checked > 2400 || candidate === word || candidates.has(candidate)) return;
    if (dictionary.check(candidate)) candidates.add(candidate);
  };
  for (let i = 0; i < letters.length; i++) {
    visit(letters.filter((_, j) => j !== i).join(''));
    if (i < letters.length - 1) {
      const transposed = [...letters];
      [transposed[i], transposed[i + 1]] = [transposed[i + 1], transposed[i]];
      visit(transposed.join(''));
    }
  }
  for (let i = 0; i <= letters.length; i++) {
    for (const letter of alphabet) {
      visit(letters.slice(0, i).join('') + letter + letters.slice(i).join(''));
      if (i < letters.length) visit(letters.slice(0, i).join('') + letter + letters.slice(i + 1).join(''));
    }
  }
  return [...candidates].sort((a, b) => Number(CV_VOCABULARY.has(b)) - Number(CV_VOCABULARY.has(a))
    || Math.abs(a.length - word.length) - Math.abs(b.length - word.length)
    || a.localeCompare(b, 'pt-PT')).slice(0, 3);
}

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else if (a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; }
    else { i++; j++; }
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

function scanWriting(text, ignoredWords, dictionary) {
  const issues = [];
  const seen = new Set();
  const ignored = new Set(ignoredWords.map(normalizeWord));
  const ranges = protectedRanges(text);
  const isProtected = (start, end) => ranges.some(([left, right]) => start < right && end > left);
  let suggestedWords = 0;
  let limited = false;
  const add = (issue) => {
    if (issues.length >= MAX_ISSUES) { limited = true; return; }
    issues.push(issue);
  };
  for (const match of text.matchAll(/(?<![\p{L}\p{M}])([\p{L}]{2,})[ \t]+\1(?![\p{L}\p{M}])/giu)) {
    if (isProtected(match.index, match.index + match[0].length)) continue;
    add({ id: `repeat-${match.index}`, word: match[0], kind: 'punctuation',
      message: 'Palavra repetida: confirma se a repetição é intencional.',
      suggestions: [match[1]], offset: match.index, length: match[0].length });
  }
  for (const match of text.matchAll(/[ \t]+[,;:!?]/gu)) {
    const before = text.slice(Math.max(0, match.index - 1), match.index);
    if (!before || /\s/.test(before) || isProtected(match.index, match.index + match[0].length)) continue;
    add({ id: `space-${match.index}`, word: match[0], kind: 'punctuation',
      message: 'Retira o espaço antes deste sinal de pontuação.',
      suggestions: [match[0].trim()], offset: match.index, length: match[0].length });
  }
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu)) {
    const original = match[0];
    const word = normalizeWord(original);
    const end = match.index + original.length;
    if (word.length < 3 || word.length > 60 || seen.has(word) || ignored.has(word) || ALLOWLIST.has(word)
      || isProtected(match.index, end) || /[\d_+#]/u.test(text[match.index - 1] || '')
      || /[\d_+#]/u.test(text[end] || '')) continue;
    seen.add(word);
    // Acronyms, software CamelCase and capitalised proper names are treated conservatively.
    if (/\p{Ll}\p{Lu}/u.test(original)) continue;
    if (dictionary.check(original) || dictionary.check(word)) continue;
    const capitalized = /^\p{Lu}/u.test(original);
    const allCaps = original === original.toLocaleUpperCase('pt-PT');
    if (allCaps && original.length <= 5) continue;
    if (capitalized && ![...CV_VOCABULARY].some((candidate) => oneEditApart(word, candidate))) continue;
    let suggestions = [];
    if (suggestedWords < MAX_SUGGESTED_WORDS) {
      suggestedWords++;
      suggestions = nearbySuggestions(word, dictionary);
    }
    add({ id: `spelling-${match.index}`, word: original, kind: 'spelling',
      message: suggestions.length
        ? `Possível lapso em «${original}». Confirma a grafia no contexto.`
        : `«${original}» não consta do dicionário. Confirma se é um nome próprio, um termo técnico ou um lapso.`,
      suggestions: suggestions.map((candidate) => allCaps ? candidate.toLocaleUpperCase('pt-PT')
        : capitalized ? candidate[0].toLocaleUpperCase('pt-PT') + candidate.slice(1) : candidate),
      offset: match.index, length: original.length });
  }
  return { ready: true, issues: issues.sort((a, b) => a.offset - b.offset), limited };
}

self.addEventListener('message', async ({ data }) => {
  const { id, text, ignoredWords = [] } = data || {};
  if (typeof text !== 'string' || text.length > 30000 || !Array.isArray(ignoredWords)) {
    self.postMessage({ id, result: { ready: false, issues: [], error: 'O texto para revisão é inválido ou ultrapassa 30 000 caracteres.' } });
    return;
  }
  try {
    const dictionary = await getDictionary();
    const ignored = ignoredWords.filter((word) => typeof word === 'string' && word.length <= 60).slice(0, 500);
    self.postMessage({ id, result: scanWriting(text, ignored, dictionary) });
  } catch {
    self.postMessage({ id, result: { ready: false, issues: [], error: 'Não foi possível carregar o dicionário de português de Portugal. Tenta novamente.' } });
  }
});
