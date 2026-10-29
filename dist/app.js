import { analyzeCV, exampleCV } from './analyzer.js?v=4.0.1';
import { checkWriting, clearWriting } from './writing.js?v=4.0.1';
import { readCVFile } from './pdf-reader.js?v=4.0.1';
import { parseCV, serializeCV, normalizeModel } from './cv-model.js?v=4.0.1';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const countWords = text => (text.match(/[\p{L}\p{N}]+/gu) || []).length;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
const fields = [
  { id: 'name', label: 'Nome', placeholder: 'O teu nome', rows: 1 },
  { id: 'headline', label: 'Título profissional ou área', placeholder: 'Ex.: Estudante de Economia', rows: 1 },
  { id: 'contact', label: 'Contactos', placeholder: 'Email · telefone ou ligação profissional, se relevante', rows: 2 },
  { id: 'profile', label: 'Perfil', placeholder: 'O teu percurso e a área que procuras.', rows: 4, hint: 'Um resumo breve, se fizer sentido para o teu CV.' },
  { id: 'education', label: 'Formação', placeholder: 'Curso — instituição\nDatas', rows: 6, hint: 'Curso, instituição e datas.' },
  { id: 'experience', label: 'Experiência e projetos', placeholder: 'Função — organização\nDatas\nO teu contributo.', rows: 10, hint: 'Mantém os títulos e uma tarefa por ponto.' },
  { id: 'skills', label: 'Competências', placeholder: 'Competência: aplicação prática.', rows: 5, hint: 'Ferramentas, aplicações e idiomas.' },
  { id: 'extra', label: 'Outras informações', placeholder: 'Outras informações relevantes.', rows: 5, hint: 'Confirma se esta informação está na secção certa.' },
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
  document.body.dataset.step = String(step);
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
  $('job-text').value = '';
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
  busy(true, 'A analisar o teu currículo…');
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
    busy(false, 'Análise concluída.');
    showStep(2);
  } catch (e) {
    if (version !== state.version) return;
    busy(false);
    error(e.message || 'Não foi possível concluir a análise. Tenta novamente.');
  }
}

function summaryHTML(result, metadata) {
  const missing = 100 - result.score;
  return `<div class="score-card"><div class="score-value">${result.score}<small>/100</small></div><div class="score-description"><h2>${result.score >= 85 ? 'Uma boa base.' : 'Há espaço para melhorar.'}</h2><p>${missing ? missing + ' pontos por melhorar.' : 'Todos os critérios verificados foram cumpridos.'}</p></div></div><div class="group-breakdown">${result.groups.map(group => `<div class="group-row"><div><span>${esc(group.label.replace(' do PDF',''))}</span><b>${group.points}/${group.maxPoints}</b></div><div class="bar"><i style="width:${group.points/group.maxPoints*100}%"></i></div></div>`).join('')}</div><p class="score-caveat">${!metadata ? 'Os 15 pontos de apresentação são medidos ao criar o PDF. ' : ''}A pontuação orienta melhorias; não prevê contratação.</p>`;
}

function prioritisedActions(result) {
  const layout = result.improvements.filter(item => item.kind === 'layout');
  const other = result.improvements.filter(item => item.kind !== 'layout');
  if (layout.length) other.push({ id: 'layout-all', title: 'Dar mais clareza à apresentação', gain: layout.reduce((sum, item) => sum + item.gain, 0), kind: 'layout', description: [...new Set(layout.map(item => item.description))].join(' '), example: 'Experimenta um dos modelos de uma coluna. O PDF criado será novamente medido; a pontuação depende do resultado real.', editorField: null });
  return other.sort((a, b) => b.gain - a.gain);
}

function shortAction(item) {
  const map = {
    contact: ['Completar o contacto', 'Inclui um email ou telefone válido.'],
    profile: ['Apresentar o teu percurso', 'Explica a tua área e a experiência relevante.'],
    education: ['Completar a formação', 'Acrescenta curso, instituição e datas.'],
    experience: ['Explicar a tua experiência', 'Indica onde estiveste, quando e o que fizeste.'],
    evidence: ['Mostrar o teu contributo', 'Acrescenta uma entrega ou resultado real do teu trabalho.'],
    skills: ['Dar contexto às competências', 'Diz como usas uma ferramenta ou competência.'],
    sections: ['Organizar as secções', 'Separa formação, experiência e competências.'],
    concision: ['Encurtar descrições longas', 'Usa uma ideia por frase e mantém o essencial.'],
    repetition: ['Rever repetições', 'Confirma se há informação repetida sem necessidade.'],
    spelling: ['Rever a escrita', 'Confirma os termos assinalados e aplica as correções úteis.'],
    punctuation: ['Ajustar a pontuação', 'Revê os espaços e as palavras repetidas.'],
    'layout-all': ['Melhorar a apresentação', 'O modelo Rumo alinha o texto e ajusta os espaçamentos.'],
  };
  return map[item.id] || (item.kind === 'writing' ? map.spelling : [item.title, 'Revê esta informação no editor.']);
}

function actionsHTML(result, context = 'original') {
  if (result.score === 100) return '<div class="success-box"><h3>Tudo revisto.</h3><p>Confirma os dados e faz uma última leitura.</p></div>';
  const actions = prioritisedActions(result);
  const row = item => { const [title, description] = shortAction(item); return `<div class="action-row"><div class="action-copy"><h3>${esc(title)}</h3><p>${esc(description)}</p></div><span class="gain">+${item.gain} ${item.gain === 1 ? 'ponto' : 'pontos'}</span><button type="button" data-improve="${esc(item.editorField || '')}" data-kind="${item.kind}" aria-label="${esc(title)} no editor">↗</button></div>`; };
  return `${context === 'editor' ? '<div class="section-label"><h3>Ainda por melhorar</h3></div>' : ''}${actions.slice(0,3).map(row).join('')}${actions.length>3 ? `<details class="more-actions"><summary>Ver mais ${actions.length-3} sugestões</summary>${actions.slice(3).map(row).join('')}</details>` : ''}`;
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
  $('model-fields').innerHTML = `<div class="identity-fields">${fields.slice(0, 3).map(input).join('')}</div>${fields.slice(3).map(field => `<details class="model-section" id="section-${field.id}" ${''}><summary>${esc(field.label)}<span id="badge-${field.id}">${state.model[field.id].trim() ? 'Rever +' : 'Completar +'}</span></summary>${input(field)}<p class="hint">${esc(field.hint)}</p><div id="prompt-${field.id}"></div></details>`).join('')}`;
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
  busy(false, 'Alterações por aplicar.');
  error('');
  renderComparison();
}

function renderComparison() {
  const current = state.generated?.revision === state.revision ? state.generated.result : null;
  const original = state.original.result.score;
  $('comparison').innerHTML = `<div class="comparison-score"><span>Original</span><b>${original}<small>/100</small></b></div><span class="comparison-arrow" aria-hidden="true">→</span><div class="comparison-score"><span>Nova versão</span><b>${current ? current.score : '—'}<small>/100</small></b></div><div class="comparison-description"><b>${current ? current.score === 100 ? 'Critérios concluídos.' : (100-current.score) + ' pontos por melhorar.' : 'Alterações por aplicar.'}</b><p>${current ? 'Revê o conteúdo e descarrega o PDF.' : 'Atualiza o PDF para ver a nova pontuação.'}</p></div>`;
}

async function regenerate() {
  if (!state.model || state.busy) return;
  error('');
  const model = normalizeModel(state.model);
  const serialized = serializeCV(model);
  try { analyzeCV(serialized); } catch (e) { error(e.message); return; }
  const revision = state.revision;
  const version = ++state.version;
  const template = 'rumo';
  $('download-pdf').disabled = true;
  busy(true, 'A preparar a nova versão…');
  try {
    const { createCVPdf } = await import('./pdf-export.js?v=4.0.1');
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
    $('export-notice').textContent = 'Confirma os dados antes de enviar a candidatura.';
    $('preview-caption').textContent = pdf.fitInfo?.message || 'O ficheiro descarregado tem esta apresentação.';
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
    $(`prompt-${field.id}`).innerHTML = improvements.length ? `<p class="field-prompt">${esc(improvements.map(item => shortAction(item)[1]).join(' '))}</p>` : '';
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
