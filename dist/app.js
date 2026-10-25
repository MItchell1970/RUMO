import { analyzeCV, exampleCV } from './analyzer.js';
import { checkWriting, clearWriting } from './writing.js';
import { readCVFile } from './pdf-reader.js';
import { parseCV, serializeCV, normalizeModel } from './cv-model.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const countWords = text => (text.match(/[\p{L}\p{N}]+/gu) || []).length;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
const fields = [
  { id: 'name', label: 'Nome', placeholder: 'O teu nome', rows: 1 },
  { id: 'headline', label: 'Título profissional ou área', placeholder: 'Ex.: Estudante de Economia', rows: 1 },
  { id: 'contact', label: 'Contactos', placeholder: 'Email · telefone ou ligação profissional, se relevante', rows: 2 },
  { id: 'profile', label: 'Perfil', placeholder: 'O teu percurso, o que sabes fazer e a oportunidade que procuras.', rows: 5, hint: 'Apresenta-te em duas ou três frases claras. Liga o teu percurso ao próximo passo.' },
  { id: 'education', label: 'Formação', placeholder: 'Curso — instituição\nDatas ou estado atual', rows: 5, hint: 'Identifica o curso, a instituição e as datas. Inclui formação relevante para a candidatura.' },
  { id: 'experience', label: 'Experiência e projetos', placeholder: 'Função ou projeto — organização\nDatas\nO que fizeste e o que entregaste.', rows: 8, hint: 'Projetos de faculdade e voluntariado também contam. Explica a tua ação e uma entrega ou resultado real.' },
  { id: 'skills', label: 'Competências', placeholder: 'Ferramenta ou capacidade: o que sabes fazer com ela.', rows: 5, hint: 'Em vez de uma lista de palavras, acrescenta uma aplicação concreta. Indica idiomas e níveis se forem relevantes.' },
  { id: 'extra', label: 'Outras informações', placeholder: 'Certificações, idiomas ou informação relevante que não ficou nas outras secções.', rows: 5, hint: 'Mantivemos aqui o texto não classificado. Move-o para a secção certa ou conserva-o, se for relevante.' },
];
const state = {
  step: 1, version: 0, busy: false, inputMeta: null, inputName: '', original: null,
  model: null, revision: 0, generated: null, ignoredWords: new Set(), draftWriting: null,
};

function status(message = '', busy = false) {
  $('global-status').textContent = message;
  $('global-status').classList.toggle('busy', busy);
}

function busy(value, message = '') {
  state.busy = value;
  $('analyze-button').disabled = value;
  $('regenerate-button').disabled = value;
  $('workspace').setAttribute('aria-busy', String(value));
  status(message, value);
}

function error(message) {
  $('global-error').textContent = message;
  $('global-error').hidden = !message;
  if (message) $('global-error').scrollIntoView({ behavior: motion(), block: 'nearest' });
}

function showStep(step, focus = true) {
  if (step > 1 && !state.original) return;
  state.step = step;
  for (let n = 1; n <= 3; n++) {
    $(`panel-${n}`).hidden = n !== step;
    $(`step-${n}`).classList.toggle('active', n === step);
    if (n === step) $(`step-${n}`).setAttribute('aria-current', 'step');
    else $(`step-${n}`).removeAttribute('aria-current');
  }
  document.body.classList.toggle('has-analysis', Boolean(state.original));
  $('step-2').disabled = !state.original;
  $('step-3').disabled = !state.original;
  $('new-cv').hidden = !state.original;
  if (focus) {
    $('workspace').scrollIntoView({ behavior: motion(), block: 'start' });
    $(step === 1 ? 'upload-title' : step === 2 ? 'diagnosis-title' : 'editor-title').focus({ preventScroll: true });
  }
}

function updateCount() { $('word-count').textContent = `${countWords($('cv-text').value)} palavras`; }

function discardAnalysis() {
  state.version++;
  state.original = null;
  state.model = null;
  state.generated = null;
  state.draftWriting = null;
  state.revision++;
  state.ignoredWords.clear();
  $('pdf-pages').replaceChildren();
  $('preview-empty').hidden = false;
  $('preview-empty').textContent = 'A pré-visualização do teu novo currículo aparece aqui.';
  $('preview-stale').hidden = true;
  $('download-pdf').disabled = true;
  busy(false);
  error('');
  showStep(1, false);
}

function resetAll() {
  discardAnalysis();
  clearWriting();
  state.inputMeta = null;
  state.inputName = '';
  $('cv-form').reset();
  $('file-status').textContent = '';
  updateCount();
  showStep(1);
}

function useExample() {
  discardAnalysis();
  state.inputMeta = null;
  state.inputName = 'Exemplo fictício de Economia';
  $('cv-file').value = '';
  $('cv-text').value = exampleCV;
  $('file-status').textContent = state.inputName;
  updateCount();
  analyzeOriginal();
}

async function importFile(file) {
  if (!file) return;
  discardAnalysis();
  const version = state.version;
  busy(true, 'A ler o currículo no teu navegador…');
  try {
    const imported = await readCVFile(file);
    if (version !== state.version) return;
    state.inputMeta = imported.metadata;
    state.inputName = imported.name;
    $('cv-text').value = imported.text;
    $('file-status').textContent = `${imported.name} · ${countWords(imported.text)} palavras${imported.metadata ? ` · ${imported.metadata.pageCount} página(s)` : ''}`;
    updateCount();
    await analyzeOriginal();
  } catch (e) {
    if (version !== state.version) return;
    busy(false);
    error(e.message || 'Não foi possível ler o ficheiro. Experimenta colar o texto.');
  } finally { $('cv-file').value = ''; }
}

async function analyzeOriginal() {
  const text = $('cv-text').value;
  const jobText = $('job-text').value;
  error('');
  try { analyzeCV(text, { jobText }); } catch (e) {
    busy(false);
    error(e.message);
    $('paste-details').open = true;
    $('cv-text').focus();
    return;
  }
  const version = ++state.version;
  busy(true, 'A analisar conteúdo, estrutura, escrita e apresentação…');
  try {
    const writing = await checkWriting(text);
    if (version !== state.version) return;
    const result = analyzeCV(text, { jobText, writingReady: writing.ready, writingIssues: writing.issues, pdfMeta: state.inputMeta });
    state.original = { text, jobText, writing, result, metadata: state.inputMeta, name: state.inputName || 'Texto colado' };
    state.model = null;
    state.generated = null;
    state.draftWriting = null;
    state.ignoredWords.clear();
    renderDiagnosis();
    busy(false, 'Diagnóstico concluído. Começa pelas melhorias com maior impacto.');
    showStep(2);
  } catch (e) {
    if (version !== state.version) return;
    busy(false);
    error(e.message || 'Não foi possível concluir a análise. Tenta novamente.');
  }
}

function summaryHTML(result, metadata) {
  const missing = 100 - result.score;
  return `<div class="score-card"><span class="eyebrow">PREPARAÇÃO DO CURRÍCULO</span><div class="score-main"><h3>${result.score >= 85 ? 'Uma boa base para avançar.' : 'Já sabes por onde começar.'}</h3><div class="score-ring" style="--score:${result.score}" role="img" aria-label="${result.score} pontos em 100"><div><b>${result.score}</b><small>de 100</small></div></div></div><p>${missing ? `Há <strong>${missing} pontos</strong> por completar nesta lista.` : 'Cumpriste todos os critérios desta versão da Rumo.'}${!metadata ? ' <strong>15 pontos</strong> de apresentação ainda não foram medidos.' : ''}</p></div><p class="score-caveat">Uma orientação para melhorar o documento. Não prevê contratação nem substitui a revisão humana.</p><div class="group-breakdown"><h4>A tua pontuação, por área</h4>${result.groups.map(group => `<div class="group-row"><div><span>${esc(group.label)}</span><b>${group.points} / ${group.maxPoints}</b></div><div class="bar"><i style="width:${group.points / group.maxPoints * 100}%"></i></div></div>`).join('')}</div>`;
}

function prioritisedActions(result) {
  const layout = result.improvements.filter(item => item.kind === 'layout');
  const other = result.improvements.filter(item => item.kind !== 'layout');
  if (layout.length) other.push({ id: 'layout-all', title: 'Dar mais clareza à apresentação', gain: layout.reduce((sum, item) => sum + item.gain, 0), kind: 'layout', description: [...new Set(layout.map(item => item.description))].join(' '), example: 'Experimenta um dos modelos de uma coluna. O PDF criado será novamente medido; a pontuação depende do resultado real.', editorField: null });
  return other.sort((a, b) => b.gain - a.gain);
}

function actionsHTML(result, context = 'original') {
  if (result.score === 100) return '<div class="success-box"><h3>Critérios concluídos.</h3><p>Confirma todos os factos, lê a versão final e adapta-a à oportunidade. O próximo passo é teu.</p></div>';
  const actions = prioritisedActions(result);
  return `<div class="section-label"><h3>${context === 'original' ? 'O caminho até aos 100' : 'O que ainda podes melhorar'}</h3><span>${actions.length} passos para rever</span></div>${actions.map((item, index) => `<details class="action-card" ${index < (context === 'original' ? 2 : 1) ? 'open' : ''}><summary><span class="action-title"><span class="action-number">${String(index + 1).padStart(2, '0')}</span><b>${esc(item.title)}</b></span><span class="gain">+${item.gain} pontos</span></summary><div class="action-content"><p>${esc(item.description)}</p>${item.example ? `<div class="action-example"><small>UMA PISTA PARA COMEÇAR</small>${esc(item.example)}</div>` : ''}<button class="text-button" type="button" data-improve="${esc(item.editorField || '')}" data-kind="${item.kind}">${item.kind === 'layout' ? 'Rever o modelo e o conteúdo' : item.kind === 'writing' ? 'Rever a escrita' : 'Melhorar no editor'} <span aria-hidden="true">↗</span></button></div></details>`).join('')}`;
}

function renderDiagnosis() {
  const original = state.original;
  $('diagnosis-source').textContent = `${original.name} · ${original.result.wordCount} palavras${original.metadata ? ` · ${original.metadata.pageCount} página(s)` : ' · apresentação original não disponível'}`;
  $('original-summary').innerHTML = summaryHTML(original.result, original.metadata);
  $('diagnosis-actions').innerHTML = actionsHTML(original.result);
  $('original-criteria').innerHTML = criteriaHTML(original.result);
  $('original-writing').innerHTML = original.writing.issues.length ? `<section class="writing-panel"><h3>${original.writing.issues.length} alerta(s) de escrita</h3><p>Possíveis lapsos a confirmar: ${original.writing.issues.slice(0, 8).map(item => `«${esc(item.word)}»`).join(', ')}${original.writing.issues.length > 8 ? '…' : ''}. Podes rever e aplicar sugestões no editor.</p><button class="text-button" data-improve="" data-kind="writing" type="button">Rever a escrita no editor ↗</button></section>` : `<section class="writing-panel"><h3>${original.writing.ready ? 'Sem alertas nas regras de escrita' : 'Revisão automática indisponível'}</h3><p>${original.writing.ready ? 'Faz ainda uma leitura da gramática, dos nomes e dos factos. Nem todos os erros podem ser detetados automaticamente.' : esc(original.writing.error || 'O dicionário não carregou. Podes voltar a analisar; os pontos de escrita ficam por avaliar.')}</p></section>`;
  $('original-metrics').innerHTML = metricsHTML(original.metadata);
  $('original-keywords').innerHTML = original.jobText.trim() ? keywordsHTML(original.result.keywords) : '';
}

function criteriaHTML(result) {
  return result.checks.map(check => `<div class="criterion"><h4>${esc(check.label)}</h4><span>${check.points} / ${check.maxPoints}</span><p>${esc(check.evidence)}</p></div>`).join('');
}

function metricsHTML(meta) {
  if (!meta) return '<section class="metrics-panel"><h3>A apresentação ainda está por medir</h3><p>O texto colado não contém dimensões nem tipos de letra. Ao criares a próxima versão, a Rumo mede o PDF efetivamente gerado.</p></section>';
  const number = (value, suffix = '') => Number.isFinite(value) ? `${Number(value.toFixed(1))}${suffix}` : 'Por medir';
  const metrics = [[String(meta.pageCount), 'Páginas'], [number(meta.bodyFontSize, ' pt'), 'Letra de corpo estimada'], [number(meta.minMarginPt, ' pt'), 'Menor margem de texto'], [number(Number.isFinite(meta.tightLineRatio) ? meta.tightLineRatio * 100 : null, '%'), 'Linhas próximas'], [number(Number.isFinite(meta.textDensity) ? meta.textDensity * 100 : null, '%'), 'Cobertura de texto'], [number(meta.fontFamilyCount), 'Famílias tipográficas']];
  return `<section class="metrics-panel"><h3>Um olhar sobre o teu template</h3><p>Sinais aproximados do PDF, não uma avaliação estética do modelo.</p><div class="metrics-grid">${metrics.map(([value, label]) => `<div class="metric"><b>${esc(value)}</b><span>${label}</span></div>`).join('')}</div><p>Os indicadores não avaliam fotografias, cores, gráficos nem todos os problemas de sobreposição. Confirma a apresentação final.</p></section>`;
}

function keywordsHTML(keywords) {
  const chips = values => values.map(value => `<span>${esc(value)}</span>`).join('');
  return `<section class="keyword-panel"><h3>Ligação à oportunidade</h3><p>Termos da vaga encontrados no CV:</p><div class="chips">${chips(keywords.matched) || '<span>Nenhum identificado</span>'}</div><p>Termos não encontrados:</p><div class="chips missing">${chips(keywords.missing) || '<span>Nenhum outro termo selecionado</span>'}</div><p>É uma comparação de palavras, sem compreensão do contexto. Inclui apenas competências e experiências que possuas.</p></section>`;
}

function buildFields() {
  const input = field => `<label class="field-label" for="field-${field.id}">${esc(field.label)}</label>${field.rows === 1 ? `<input type="text" id="field-${field.id}" data-field="${field.id}" maxlength="30000" placeholder="${esc(field.placeholder)}" value="${esc(state.model[field.id])}">` : `<textarea id="field-${field.id}" data-field="${field.id}" rows="${field.rows}" maxlength="30000" placeholder="${esc(field.placeholder)}" spellcheck="true">${esc(state.model[field.id])}</textarea>`}`;
  $('model-fields').innerHTML = `<div class="identity-fields">${fields.slice(0, 3).map(input).join('')}</div>${fields.slice(3).map(field => `<details class="model-section" id="section-${field.id}" ${field.id === 'profile' ? 'open' : ''}><summary>${esc(field.label)}<span id="badge-${field.id}">${state.model[field.id].trim() ? 'Rever +' : 'Completar +'}</span></summary>${input(field)}<p class="hint">${esc(field.hint)}</p><div id="prompt-${field.id}"></div></details>`).join('')}`;
  $('unassigned-notice').hidden = !state.model.extra.trim();
}

async function openEditor(field, kind) {
  if (!state.original) return;
  if (!state.model) {
    state.model = normalizeModel(parseCV(state.original.text));
    state.revision++;
    state.generated = null;
    buildFields();
    $('draft-writing').replaceChildren();
    $('pdf-pages').replaceChildren();
    $('preview-empty').hidden = false;
    $('preview-stale').hidden = true;
    renderComparison();
  }
  showStep(3);
  if (field) focusField(field);
  else if (kind === 'writing') $('draft-writing').scrollIntoView({ behavior: motion(), block: 'center' });
  else if (kind === 'layout' && state.generated) $('pdf-viewer').scrollIntoView({ behavior: motion(), block: 'center' });
  if (!state.generated && !state.busy) await regenerate();
}

function focusField(id) {
  if (!$(`field-${id}`)) return;
  const section = $(`section-${id}`);
  if (section) section.open = true;
  $(`field-${id}`).focus();
}

function markDraftChanged() {
  state.version++;
  state.revision++;
  state.draftWriting = null;
  $('draft-writing').replaceChildren();
  $('download-pdf').disabled = true;
  $('preview-status').textContent = 'À atualizar';
  $('preview-stale').hidden = !state.generated;
  $('export-notice').textContent = 'Atualiza o PDF para aplicar as alterações e voltar a medir a pontuação.';
  $('editor-next').innerHTML = '';
  busy(false, 'Alterações por aplicar. Atualiza o PDF e a pontuação quando estiveres pronto.');
  error('');
  renderComparison();
}

function renderComparison() {
  const current = state.generated?.revision === state.revision ? state.generated.result : null;
  const original = state.original.result.score;
  const delta = current ? current.score - original : 0;
  $('comparison').innerHTML = `<div class="comparison-score"><span>Original</span><b>${original}<small> /100</small></b></div><span class="comparison-arrow" aria-hidden="true">→</span><div class="comparison-score"><span>Novo PDF</span><b>${current ? current.score : '—'}<small> /100</small></b></div><div class="comparison-description"><b>${current ? delta > 0 ? `Mais ${delta} pontos. Um passo em frente.` : delta < 0 ? 'A nova versão precisa de mais atenção.' : 'Uma nova apresentação. A mesma pontuação.' : 'A pontuação acompanha o documento real.'}</b><p>${current ? current.score === 100 ? 'Cumpriste os critérios da ferramenta. Confirma os factos e a leitura final.' : `Faltam ${100 - current.score} pontos. Encontras os próximos passos por baixo da pré-visualização.` : 'Atualiza o PDF para avaliar o conteúdo e a apresentação desta versão.'}</p></div>`;
}

async function regenerate() {
  if (!state.model || state.busy) return;
  error('');
  const model = normalizeModel(state.model);
  const serialized = serializeCV(model);
  try { analyzeCV(serialized); } catch (e) { error(e.message); return; }
  const revision = state.revision;
  const version = ++state.version;
  const template = document.querySelector('input[name="template"]:checked').value;
  $('download-pdf').disabled = true;
  busy(true, 'A criar o PDF e a verificar a nova versão…');
  try {
    const { createCVPdf } = await import('./pdf-export.js');
    const pdf = await createCVPdf(model, { template });
    if (version !== state.version) return;
    const imported = await readCVFile(new File([pdf.bytes], pdf.filename, { type: 'application/pdf' }));
    if (version !== state.version) return;
    const writing = await checkWriting(imported.text, { ignoredWords: [...state.ignoredWords] });
    if (version !== state.version) return;
    const result = analyzeCV(imported.text, { jobText: state.original.jobText, writingReady: writing.ready, writingIssues: writing.issues, pdfMeta: imported.metadata });
    const draftWriting = await checkWriting(serialized, { ignoredWords: [...state.ignoredWords] });
    if (version !== state.version) return;
    state.model = model;
    for (const field of fields) $(`field-${field.id}`).value = model[field.id];
    state.generated = { ...pdf, metadata: imported.metadata, result, writing, revision, template };
    state.draftWriting = { ...draftWriting, text: serialized };
    renderDraftWriting();
    renderComparison();
    updateEditorPrompts(result);
    $('editor-next').innerHTML = actionsHTML(result, 'editor');
    $('preview-stale').hidden = true;
    $('preview-status').textContent = `${pdf.pageCount} página${pdf.pageCount === 1 ? '' : 's'}`;
    $('export-notice').textContent = result.score === 100 ? 'Critérios concluídos. Faz uma última leitura antes de enviar o currículo.' : `Podes descarregar já esta versão. Os ${100 - result.score} pontos em falta continuam assinalados; não acrescentámos factos por ti.`;
    $('preview-caption').textContent = 'Pré-visualização do ficheiro real, com texto selecionável no PDF descarregado.';
    try { await renderPDF(pdf.bytes, version); } catch (previewError) {
      if (version === state.version) {
        $('pdf-pages').replaceChildren();
        $('preview-empty').hidden = false;
        $('preview-empty').textContent = 'Não foi possível mostrar a pré-visualização. Podes descarregar o PDF e abri-lo no teu dispositivo.';
        $('preview-caption').textContent = 'Pré-visualização indisponível nesta sessão.';
      }
    }
    if (version !== state.version) return;
    $('download-pdf').disabled = false;
    busy(false, `Novo PDF criado e avaliado: ${result.score} de 100 pontos.`);
  } catch (e) {
    if (version !== state.version) return;
    busy(false);
    error(e.message || 'Não foi possível criar o PDF. Revê o conteúdo e tenta novamente.');
    $('preview-status').textContent = 'Rever conteúdo';
  }
}

async function renderPDF(bytes, version) {
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const fragment = document.createDocumentFragment();
    for (let index = 1; index <= pdf.numPages; index++) {
      if (version !== state.version) return;
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.className = 'pdf-page';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Pré-visualização da página ${index} de ${pdf.numPages} do novo currículo`);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fragment.append(canvas);
      page.cleanup();
    }
    if (version !== state.version) return;
    $('pdf-pages').replaceChildren(fragment);
    $('preview-empty').hidden = true;
  } finally { await task.destroy(); }
}

function updateEditorPrompts(result) {
  for (const field of fields.slice(3)) {
    const improvements = result.improvements.filter(item => item.editorField === field.id);
    $(`badge-${field.id}`).textContent = improvements.length ? `+${improvements.reduce((sum, item) => sum + item.gain, 0)} pontos por melhorar` : state.model[field.id].trim() ? 'Rever +' : 'Opcional +';
    $(`prompt-${field.id}`).innerHTML = improvements.length ? `<p class="field-prompt">${esc(improvements.map(item => item.description).join(' '))}</p>` : '';
  }
}

function locateIssue(issue) {
  if (!state.draftWriting) return null;
  const text = state.draftWriting.text;
  let cursor = 0;
  for (const field of fields) {
    const value = state.model[field.id];
    if (!value) continue;
    const start = text.indexOf(value, cursor);
    if (start < 0) continue;
    cursor = start + value.length;
    if (issue.offset >= start && issue.offset + issue.length <= cursor && value.slice(issue.offset - start, issue.offset - start + issue.length) === issue.word) return { field: field.id, offset: issue.offset - start };
  }
  return null;
}

function renderDraftWriting() {
  const writing = state.draftWriting;
  if (!writing) return;
  if (!writing.ready) {
    $('draft-writing').innerHTML = `<section class="writing-panel"><h3>Revisão automática indisponível</h3><p>${esc(writing.error || 'Tenta atualizar novamente. Os pontos não verificados permanecem por avaliar.')}</p></section>`;
    return;
  }
  if (!writing.issues.length) {
    $('draft-writing').innerHTML = `<section class="writing-panel"><h3>✓ Sem alertas nas regras verificadas</h3><p>Confirma ainda a gramática, os nomes e a veracidade do conteúdo.${state.ignoredWords.size ? ` ${state.ignoredWords.size} termo(s) foram confirmados por ti.` : ''}</p></section>`;
    return;
  }
  $('draft-writing').innerHTML = `<section class="writing-panel"><h3>${writing.issues.length} alerta(s) de escrita a rever</h3><p>Confirma o contexto antes de aplicar. Nomes e termos técnicos podem estar corretos.</p>${writing.issues.map((issue, index) => {
    const location = locateIssue(issue);
    return `<div class="issue"><div class="issue-top"><span class="issue-word">${esc(issue.word)}</span>${issue.kind === 'spelling' ? `<button type="button" class="ignore-word" data-ignore="${index}">Está correto</button>` : ''}</div><p>${esc(issue.message)}</p><div class="issue-actions">${location ? issue.suggestions.map((suggestion, n) => `<button class="correction" data-correct="${index}" data-suggestion="${n}" type="button">Usar «${esc(suggestion)}»</button>`).join('') : '<span class="hint">Revê este termo diretamente nos campos acima.</span>'}</div></div>`;
  }).join('')}${writing.limited ? '<p>Revê estes alertas e atualiza o PDF para continuar a revisão.</p>' : ''}</section>`;
}

function applyCorrection(index, suggestionIndex) {
  if (state.busy || !state.draftWriting || state.draftWriting.text !== serializeCV(state.model)) return;
  const issue = state.draftWriting.issues[index];
  const location = locateIssue(issue);
  const suggestion = issue?.suggestions[suggestionIndex];
  if (!location || typeof suggestion !== 'string') return;
  const value = state.model[location.field];
  state.model[location.field] = value.slice(0, location.offset) + suggestion + value.slice(location.offset + issue.length);
  $(`field-${location.field}`).value = state.model[location.field];
  markDraftChanged();
  focusField(location.field);
  regenerate();
}

function download(bytes, type, filename) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function downloadPlan() {
  if (!state.original) return;
  const { result } = state.original;
  const text = `RUMO — PLANO DE MELHORIA\n\nPontuação original: ${result.score}/100\n${100 - result.score} pontos por completar.\n\nÁREAS\n${result.groups.map(group => `${group.label}: ${group.points}/${group.maxPoints}`).join('\n')}\n\nPRÓXIMOS PASSOS\n${result.improvements.map(item => `+${item.gain} pontos — ${item.title}\n${item.description}\n${item.example || ''}`).join('\n\n')}\n\nCRITÉRIOS\n${result.checks.map(item => `${item.label}: ${item.points}/${item.maxPoints}\n${item.evidence}`).join('\n\n')}\n\nEsta avaliação usa regras educativas e medidas aproximadas. Não garante contratação nem certifica compatibilidade ATS. Acrescenta apenas informações verdadeiras e revê o documento antes de o enviar.\n`;
  download(text, 'text/plain;charset=utf-8', 'rumo-plano-de-melhoria.txt');
}

$('hero-example').addEventListener('click', useExample);
$('use-example').addEventListener('click', useExample);
$('new-cv').addEventListener('click', resetAll);
$('cv-form').addEventListener('submit', event => { event.preventDefault(); analyzeOriginal(); });
$('cv-file').addEventListener('change', event => importFile(event.target.files[0]));
$('cv-text').addEventListener('input', () => {
  discardAnalysis();
  state.inputMeta = null;
  state.inputName = 'Texto colado ou editado';
  $('file-status').textContent = 'Texto alterado. A apresentação do PDF anterior já não é usada.';
  updateCount();
});
$('job-text').addEventListener('input', () => {
  if (!state.original) return;
  state.original.jobText = $('job-text').value;
  state.original.result.keywords = analyzeCV(state.original.text, { jobText: state.original.jobText }).keywords;
  renderDiagnosis();
  status('Oportunidade atualizada. As alterações ao teu currículo foram mantidas.');
});
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.add('dragover'); });
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', event => importFile(event.dataTransfer.files[0]));
for (let n = 1; n <= 3; n++) $(`step-${n}`).addEventListener('click', () => n === 3 ? openEditor() : showStep(n));
$('start-editor').addEventListener('click', () => openEditor());
$('back-diagnosis').addEventListener('click', () => showStep(2));
$('regenerate-button').addEventListener('click', regenerate);
$('model-fields').addEventListener('input', event => {
  const field = event.target.dataset.field;
  if (!field || !state.model) return;
  state.model[field] = event.target.value;
  markDraftChanged();
});
document.querySelectorAll('input[name="template"]').forEach(input => input.addEventListener('change', () => { if (state.model) { markDraftChanged(); regenerate(); } }));
$('workspace').addEventListener('click', event => {
  const improve = event.target.closest('[data-improve]');
  if (improve) openEditor(improve.dataset.improve, improve.dataset.kind);
  const correction = event.target.closest('[data-correct]');
  if (correction) applyCorrection(Number(correction.dataset.correct), Number(correction.dataset.suggestion));
  const ignore = event.target.closest('[data-ignore]');
  if (ignore && !state.busy && state.draftWriting) {
    state.ignoredWords.add(state.draftWriting.issues[Number(ignore.dataset.ignore)].word);
    markDraftChanged();
    regenerate();
  }
});
$('download-plan').addEventListener('click', downloadPlan);
$('download-pdf').addEventListener('click', () => {
  if (!state.generated || state.generated.revision !== state.revision || state.busy) return;
  download(state.generated.bytes, 'application/pdf', state.generated.filename);
  status('PDF descarregado. Confirma o conteúdo e a apresentação antes de enviar a candidatura.');
});
if (location.hash === '#avaliar') $('workspace').scrollIntoView();
