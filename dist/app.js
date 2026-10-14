import { analyzeCV, exampleCV } from './analyzer.js';
import { checkWriting, clearWriting } from './writing.js';
import { readCVFile } from './pdf-reader.js';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const wordCount = (text) => (text.match(/[\p{L}\p{N}]+/gu) || []).length;
const state = {
  pdfMeta: null,
  sourceKind: 'text',
  result: null,
  writing: { ready: false, issues: [] },
  confirmations: {},
  ignoredWords: new Set(),
  baseline: null,
  analysisVersion: 0,
  importVersion: 0,
  analyzedText: '',
};

function showError(message) {
  $('cv-error').textContent = message;
  $('cv-error').hidden = false;
}

function setBusy(busy, message = '') {
  $('analyze-button').disabled = busy;
  $('analysis-status').textContent = message;
  $('cv-form').setAttribute('aria-busy', String(busy));
}

function updateCount() {
  const count = wordCount($('cv-text').value);
  $('word-count').textContent = `${count} ${count === 1 ? 'palavra' : 'palavras'}`;
}

function markTextEdited() {
  state.confirmations = {};
  state.pdfMeta = null;
  state.sourceKind = 'text';
  $('file-status').textContent = 'Texto editado · volta a confirmar a apresentação da nova versão no documento original.';
  invalidateResult();
  updateCount();
}

function invalidateResult() {
  state.analysisVersion++;
  state.result = null;
  $('results').hidden = true;
  $('empty-result').hidden = false;
  $('cv-error').hidden = true;
  setBusy(false);
}

function resetDocument() {
  invalidateResult();
  clearWriting();
  state.confirmations = {};
  state.ignoredWords.clear();
  state.baseline = null;
  state.pdfMeta = null;
  state.sourceKind = 'text';
  state.writing = { ready: false, issues: [] };
}

function useExample() {
  state.importVersion++;
  resetDocument();
  $('cv-file').value = '';
  $('cv-text').value = exampleCV;
  $('file-status').textContent = 'CV fictício de uma estudante de Economia, com espaço para melhorar.';
  $('text-details').open = true;
  updateCount();
  $('avaliar').scrollIntoView({ behavior: 'smooth' });
  runAnalysis(false);
}

$('use-example').addEventListener('click', useExample);
$('demo-home').addEventListener('click', useExample);
$('cv-text').addEventListener('input', () => {
  state.importVersion++;
  markTextEdited();
});
$('job-text').addEventListener('input', invalidateResult);

$('cv-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const version = ++state.importVersion;
  invalidateResult();
  setBusy(true, 'A ler o ficheiro no teu navegador…');
  try {
    const imported = await readCVFile(file);
    if (version !== state.importVersion) return;
    resetDocument();
    state.pdfMeta = imported.metadata;
    state.sourceKind = imported.kind;
    $('cv-text').value = imported.text;
    $('file-status').textContent = `${imported.name} · ${wordCount(imported.text)} palavras${imported.metadata ? ` · ${imported.metadata.pageCount} pág.` : ''}`;
    updateCount();
    await runAnalysis(false);
  } catch (error) {
    if (version !== state.importVersion) return;
    showError(error.message || 'Não foi possível ler o ficheiro. Experimenta colar o texto.');
    $('cv-file').value = '';
    setBusy(false);
  }
});

$('cv-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runAnalysis(true);
});

function analysisOptions() {
  return {
    jobText: $('job-text').value,
    pdfMeta: state.pdfMeta,
    writingIssues: state.writing.issues,
    writingReady: state.writing.ready,
    confirmations: state.confirmations,
  };
}

async function runAnalysis(scrollToResult = false) {
  const text = $('cv-text').value;
  $('cv-error').hidden = true;
  try { analyzeCV(text); } catch (error) {
    showError(error.message);
    $('text-details').open = true;
    $('cv-text').focus();
    setBusy(false);
    return;
  }
  const version = ++state.analysisVersion;
  state.result = null;
  $('results').hidden = true;
  $('empty-result').hidden = false;
  setBusy(true, 'A rever conteúdo, escrita e apresentação…');
  try {
    const writing = await checkWriting(text, { ignoredWords: [...state.ignoredWords] });
    if (version !== state.analysisVersion || text !== $('cv-text').value) return;
    state.writing = writing;
    if (writing.ready) state.confirmations.spellingReviewed = false;
    state.analyzedText = text;
    state.result = analyzeCV(text, analysisOptions());
    if (state.baseline === null) state.baseline = state.result.score;
    renderResult();
    setBusy(false, 'Análise concluída. Vê a pontuação e as melhorias sugeridas.');
    if (scrollToResult && innerWidth < 761) $('result-area').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  } catch (error) {
    if (version !== state.analysisVersion) return;
    showError(error.message || 'Não foi possível concluir a análise. Tenta novamente.');
    setBusy(false);
  }
}

function renderResult(focusId) {
  const { score, checks, improvements, keywords } = state.result;
  const missing = 100 - score;
  const delta = score - state.baseline;
  const title = score === 100 ? 'Lista de preparação concluída.' : score >= 70 ? 'O próximo passo está mais perto.' : 'Já sabes por onde começar.';
  const manualCount = Object.values(state.confirmations).filter(Boolean).length;
  const source = state.pdfMeta ? `PDF · ${state.pdfMeta.pageCount} pág. · medidas aproximadas` : state.confirmations.layoutReviewed ? 'Texto · apresentação confirmada por ti' : 'Texto · apresentação por confirmar';
  const actions = improvements.map((item) => `<article class="action-card"><div class="action-top"><h4>${escapeHTML(item.title)}</h4><span class="gain">+${item.gain} pontos</span></div><p>${escapeHTML(item.description)}</p>${item.example ? `<div class="action-example"><span>EXEMPLO / PISTA</span>${escapeHTML(item.example)}</div>` : ''}<button type="button" class="text-button" data-action="${escapeHTML(item.kind)}">${item.kind === 'content' ? 'Editar o texto do CV' : item.kind === 'writing' ? 'Rever a escrita' : 'Rever a apresentação'} ↗</button></article>`).join('');
  $('empty-result').hidden = true;
  $('results').innerHTML = `
    <div class="score-card">
      <div class="score-top"><div><span class="eyebrow">PREPARAÇÃO DO TEU CURRÍCULO</span><h3 id="score-title">${title}</h3></div><div class="score-ring" style="--score:${score}" role="img" aria-label="${score} pontos em 100"><div><b>${score}</b><small>de 100 pontos</small></div></div></div>
      <p class="score-caption">${missing ? `Faltam <strong>${missing} pontos</strong> para completar os critérios. Começa pelas melhorias abaixo.` : 'Cumpriste os critérios desta ferramenta. Mantém o CV verdadeiro, relevante e adaptado à oportunidade.'}</p>
      <div class="score-source"><span>${escapeHTML(source)}</span><span>${manualCount} ${manualCount === 1 ? 'confirmação tua' : 'confirmações tuas'}</span></div>
      ${delta ? `<div class="score-source score-delta">${delta > 0 ? '+' : ''}${delta} pontos desde a primeira análise nesta sessão.</div>` : ''}
    </div>
    <p class="score-disclaimer">A pontuação combina critérios automáticos e a tua revisão. 100 pontos não garantem emprego nem um CV perfeito.</p>
    ${missing ? `<h3 class="result-heading">O que fazer para chegar aos 100</h3><div class="action-list">${actions}</div>` : '<div class="success-box"><h4>Agora, adapta à oportunidade.</h4><p>Lê o anúncio, confirma todos os dados e escolhe os exemplos mais relevantes antes de enviares a candidatura.</p></div>'}
    ${renderWriting()}
    <section class="manual-review" id="manual-review"><h4>O teu olhar também conta</h4><p>Confirma apenas depois de reveres. Estes pontos são uma autoavaliação, não uma conclusão automática.</p>
      <label class="confirm-row"><input type="checkbox" id="grammarReviewed" ${state.confirmations.grammarReviewed ? 'checked' : ''}><span>Li o texto e revi gramática, pontuação e tempos verbais.<small>Verifica concordância, frases claras e consistência entre passado e presente.</small></span></label>
      <label class="confirm-row"><input type="checkbox" id="layoutReviewed" ${state.confirmations.layoutReviewed ? 'checked' : ''}><span>Confirmei a apresentação do documento original.<small>Letra legível, margens, espaços e datas consistentes; sem texto cortado ou sobreposto.</small></span></label>
      ${!state.writing.ready ? `<label class="confirm-row"><input type="checkbox" id="spellingReviewed" ${state.confirmations.spellingReviewed ? 'checked' : ''}><span>Revi manualmente a ortografia.<small>Usa esta confirmação quando o dicionário não estiver disponível.</small></span></label>` : ''}
    </section>
    <details class="criteria"><summary>Ver todos os critérios e pontos <span>+</span></summary>${checks.map((check) => `<div class="criterion"><h4>${escapeHTML(check.label)}</h4><span>${check.points} / ${check.maxPoints}</span><p>${escapeHTML(check.evidence)}</p></div>`).join('')}</details>
    ${$('job-text').value.trim() ? renderKeywords(keywords) : ''}
    <div class="result-actions"><button type="button" id="download-plan" class="button secondary">Descarregar plano ↓</button><button type="button" id="download-cv" class="button outline">Guardar texto do CV ↓</button></div>
    <p class="help">O texto revisto é guardado em TXT. Atualiza também o teu documento original antes de o enviares.</p>`;
  $('results').hidden = false;
  bindResultEvents();
  if (focusId) $(focusId)?.focus({ preventScroll: true });
}

function renderWriting() {
  const { ready, issues, error, limited } = state.writing;
  if (!ready) return `<section class="writing-panel" id="writing-panel"><h4>A revisão ortográfica precisa de atenção</h4><p class="help">${escapeHTML(error || 'O dicionário não carregou. Tenta analisar novamente ou confirma uma revisão manual.')}</p></section>`;
  if (!issues.length) return '<section class="writing-panel" id="writing-panel"><h4>✓ Sem alertas nas verificações de escrita</h4><p class="help">O dicionário e as regras básicas não encontraram alertas. Faz ainda uma leitura completa: isto não substitui a revisão da gramática.</p></section>';
  return `<section class="writing-panel" id="writing-panel"><h4>${issues.length} ${issues.length === 1 ? 'ponto de escrita a rever' : 'pontos de escrita a rever'}</h4><p class="help">Confirma as sugestões antes de as aplicar. Nomes e termos técnicos podem estar corretos.</p>${issues.map((issue, index) => `<div class="issue"><div class="issue-top"><span class="issue-word">${escapeHTML(issue.word)}</span>${issue.kind === 'spelling' ? `<button type="button" class="ignore-word" data-ignore="${index}">Está correto</button>` : ''}</div><p>${escapeHTML(issue.message)}</p><div class="corrections">${issue.suggestions.map((suggestion, n) => `<button type="button" class="correction" data-issue="${index}" data-suggestion="${n}">Usar “${escapeHTML(suggestion)}”</button>`).join('')}</div></div>`).join('')}${limited ? '<p class="help">Mostramos os primeiros 40 alertas. Revê estes e volta a analisar para continuar.</p>' : ''}</section>`;
}

function renderKeywords(keywords) {
  const chips = (items) => items.map((word) => `<span>${escapeHTML(word)}</span>`).join('');
  return `<section class="keyword-panel"><h4>Ligação à oportunidade</h4><p>Termos que aparecem na vaga e no teu CV:</p><div class="chips">${chips(keywords.matched) || '<p>Nenhum identificado.</p>'}</div><p>Termos não encontrados automaticamente no teu CV:</p><div class="chips missing">${chips(keywords.missing) || '<p>Não há outros termos selecionados.</p>'}</div><p>Comparação de palavras, sem avaliar o significado. Acrescenta apenas competências e experiências que tenhas realmente.</p></section>`;
}

function bindResultEvents() {
  for (const key of ['grammarReviewed', 'layoutReviewed', 'spellingReviewed']) {
    $(key)?.addEventListener('change', (event) => {
      state.confirmations[key] = event.target.checked;
      state.result = analyzeCV($('cv-text').value, analysisOptions());
      renderResult(key);
      $('analysis-status').textContent = `Pontuação atualizada: ${state.result.score} de 100 pontos.`;
    });
  }
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.action === 'content') {
      $('text-details').open = true;
      $('cv-text').focus();
    } else {
      const target = button.dataset.action === 'writing' ? 'writing-panel' : 'manual-review';
      $(target).scrollIntoView({ behavior: 'smooth', block: 'center' });
      $(target).setAttribute('tabindex', '-1');
      $(target).focus({ preventScroll: true });
    }
  }));
  document.querySelectorAll('[data-ignore]').forEach((button) => button.addEventListener('click', () => {
    state.ignoredWords.add(state.writing.issues[Number(button.dataset.ignore)].word);
    runAnalysis(false);
  }));
  document.querySelectorAll('[data-issue]').forEach((button) => button.addEventListener('click', () => {
    const issue = state.writing.issues[Number(button.dataset.issue)];
    const suggestion = issue.suggestions[Number(button.dataset.suggestion)];
    const text = $('cv-text').value;
    if (text !== state.analyzedText || text.slice(issue.offset, issue.offset + issue.length) !== issue.word) {
      showError('O texto mudou. Volta a analisar antes de aplicar a sugestão.');
      return;
    }
    $('cv-text').value = text.slice(0, issue.offset) + suggestion + text.slice(issue.offset + issue.length);
    markTextEdited();
    $('text-details').open = true;
    runAnalysis(false);
  }));
  $('download-plan').addEventListener('click', () => downloadText(buildReport(), 'rumo-plano-de-melhoria.txt'));
  $('download-cv').addEventListener('click', () => downloadText($('cv-text').value, 'rumo-texto-do-cv.txt'));
}

function buildReport() {
  const { score, checks, improvements } = state.result;
  return `RUMO — PLANO DE MELHORIA DO CV\n\nPreparação: ${score}/100\n${100 - score} pontos por completar.\n\nA pontuação combina verificações automáticas e confirmações pessoais. Não prevê contratação nem certifica um CV perfeito.\n\nPRÓXIMOS PASSOS\n${improvements.length ? improvements.map((item) => `+${item.gain} pontos — ${item.title}\n${item.description}\n${item.example || ''}`).join('\n\n') : 'Critérios concluídos. Confirma os dados e adapta o CV à oportunidade.'}\n\nCRITÉRIOS\n${checks.map((check) => `${check.label}: ${check.points}/${check.maxPoints}\n${check.evidence}`).join('\n\n')}\n\nESCRITA\n${state.writing.ready ? state.writing.issues.map((issue) => `${issue.word}: ${issue.message}${issue.suggestions.length ? ' Sugestões: ' + issue.suggestions.join(', ') : ''}`).join('\n') || 'Sem alertas nas regras verificadas. Faz uma revisão humana final.' : 'Revisão automática indisponível.'}\n\nOs exemplos são orientações, não factos sobre ti. Atualiza o teu documento original antes de enviar a candidatura.\n`;
}

function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
