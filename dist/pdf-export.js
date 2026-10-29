import { PDFDocument, rgb } from './vendor/pdf-lib.min.mjs';
import fontkit from './vendor/fontkit.min.mjs';
import { normalizeModel, serializeCV, detectCVLanguage } from './cv-model.js?v=4.0.1';

// The supplied Word reference uses Letter, half-inch margins and Times New
// Roman. Liberation Serif is its openly licensed, metric-compatible substitute.
const PAGE = [612, 792], MARGIN = 36, WIDTH = 540, CONTENT_HEIGHT = 720;
const INK = rgb(0, 0, 0), LINK = rgb(.04, .20, .65);
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SUBHEADING = /^(?:leadership(?: experience)?|voluntary work|volunteer(?:ing| work| experience)?|extracurricular activities|projects|academic projects|work experience|professional experience|lideranca|voluntariado|associativismo|atividades extracurriculares|experiencia profissional|projetos(?: academicos)?|certifications|certificacoes|languages|idiomas|linguas)$/;
let fontBytesPromise;

async function assetBytes(relative) {
  const url = new URL(relative, import.meta.url);
  if (url.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar as fontes do PDF. Verifica a ligação e tenta novamente.');
  return new Uint8Array(await response.arrayBuffer());
}
async function fonts() {
  if (!fontBytesPromise) fontBytesPromise = Promise.all(['Regular', 'Bold', 'Italic'].map(style => assetBytes(`./vendor/LiberationSerif-${style}.ttf`))).catch(error => { fontBytesPromise = null; throw error; });
  return fontBytesPromise;
}
function validateGlyphs(text, bytes) {
  const face = fontkit.create(bytes);
  const unsupported = [...new Set([...text].filter(character => !/[\n\r\t]/.test(character) && !face.hasGlyphForCodePoint(character.codePointAt(0))))];
  if (unsupported.length) {
    const sample = unsupported.slice(0, 5).map(character => `${character} (U+${character.codePointAt(0).toString(16).toUpperCase()})`).join(', ');
    throw new Error(`A fonte deste modelo não suporta: ${sample}. Substitui apenas os símbolos decorativos, ou utiliza uma fonte que preserve estes caracteres. O PDF não foi criado para evitar perder nomes ou texto.`);
  }
}

/** Wraps at word boundaries and splits long tokens without dropping text. */
export function wrapPdfText(text, font, size, maxWidth) {
  const output = [];
  for (const paragraph of text.replace(/\t/g, '    ').split('\n')) {
    if (!paragraph) { output.push(''); continue; }
    let current = '';
    for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
      if (font.widthOfTextAtSize(current + token, size) <= maxWidth) { current += token; continue; }
      if (current.trim()) { output.push(current.trimEnd()); current = ''; }
      if (!token.trim()) continue;
      for (const character of token) {
        if (current && font.widthOfTextAtSize(current + character, size) > maxWidth) { output.push(current); current = ''; }
        current += character;
      }
    }
    if (current.trim()) output.push(current.trimEnd());
  }
  return output;
}
function pairedParts(line) {
  const values = line.split(/\t+| {3,}/).map(value => value.trim()).filter(Boolean);
  return values.length > 1 ? [values.slice(0, -1).join(' · '), values.at(-1)] : null;
}

function layoutCV(model, faces, size, compact, language) {
  const rows = [], leading = size * (compact ? 1.16 : 1.20), gap = compact ? 3 : 5;
  const labels = language === 'en'
    ? { profile: 'PROFILE', education: 'EDUCATION', experience: 'WORK EXPERIENCE', additional: 'ADDITIONAL INFORMATION', skills: 'Skills' }
    : { profile: 'PERFIL', education: 'FORMAÇÃO ACADÉMICA', experience: 'EXPERIÊNCIA PROFISSIONAL', additional: 'INFORMAÇÕES ADICIONAIS', skills: 'Competências' };
  const addSpace = height => { if (rows.length && rows.at(-1).type !== 'space') rows.push({ type: 'space', height }); };
  const textRow = (text, { font = 'regular', x = 0, width = WIDTH - x, fontSize = size, lineHeight = leading, color = INK, underline = false, keepNext = 0 } = {}) => {
    const lines = wrapPdfText(text, faces[font], fontSize, width);
    lines.forEach((value, index) => rows.push({ type: 'text', height: lineHeight, runs: [{ text: value, font, size: fontSize, x, color, underline }], keepNext: index === lines.length - 1 ? keepNext : 0 }));
  };
  const pairRow = (left, right, { font = 'regular', leftFont = font, rightFont = font, fontSize = size, lineHeight = leading, color = INK, keepNext = 0 } = {}) => {
    const rightWidth = Math.min(WIDTH * .44, Math.max(60, faces[rightFont].widthOfTextAtSize(right, fontSize)));
    const leftLines = wrapPdfText(left, faces[leftFont], fontSize, WIDTH - rightWidth - 16);
    const rightLines = wrapPdfText(right, faces[rightFont], fontSize, rightWidth);
    const count = Math.max(leftLines.length, rightLines.length);
    for (let index = 0; index < count; index++) {
      const runs = [];
      if (leftLines[index]) runs.push({ text: leftLines[index], font: leftFont, size: fontSize, x: 0, color });
      if (rightLines[index]) runs.push({ text: rightLines[index], font: rightFont, size: fontSize, x: WIDTH - faces[rightFont].widthOfTextAtSize(rightLines[index], fontSize), color });
      rows.push({ type: 'text', height: lineHeight, runs, keepNext: index === count - 1 ? keepNext : 0 });
    }
  };
  const heading = title => {
    addSpace(gap + 2);
    textRow(title.toLocaleUpperCase(language === 'en' ? 'en' : 'pt-PT'), { font: 'bold', underline: true, lineHeight: leading + 2, keepNext: 2 });
  };

  // Preserve explicit header pairs. A standalone location goes in the name row.
  const contactLines = model.contact.split('\n').filter(Boolean);
  let location = '';
  if (model.name && contactLines[0] && contactLines[0].length <= 70 && !/[@\d\t|:/]/.test(contactLines[0])) location = contactLines.shift();
  if (model.name) {
    const name = model.name.toLocaleUpperCase(language === 'en' ? 'en' : 'pt-PT');
    if (location) {
      const locationLines = wrapPdfText(location, faces.regular, size, WIDTH * .32);
      const rightWidth = Math.max(...locationLines.map(line => faces.regular.widthOfTextAtSize(line, size)));
      const nameLines = wrapPdfText(name, faces.regular, 22, WIDTH - rightWidth - 16);
      for (let index = 0; index < Math.max(nameLines.length, locationLines.length); index++) rows.push({ type: 'text', height: 25, runs: [
        ...(nameLines[index] ? [{ text: nameLines[index], font: 'regular', size: 22, x: 0, color: INK }] : []),
        ...(locationLines[index] ? [{ text: locationLines[index], font: 'regular', size, x: WIDTH - faces.regular.widthOfTextAtSize(locationLines[index], size), color: INK }] : []),
      ], keepNext: 1 });
    } else textRow(name, { fontSize: 22, lineHeight: 25, keepNext: 1 });
    rows.push({ type: 'rule', height: 5, keepNext: model.contact ? 1 : 0 });
  }
  if (model.headline) textRow(model.headline, { font: 'italic' });
  for (const line of contactLines) {
    const parts = pairedParts(line), color = /@|linkedin\.com|https?:\/\//i.test(line) ? LINK : INK;
    if (parts) pairRow(...parts, { color });
    else textRow(line, { color });
  }
  const body = (value, key) => {
    const lines = value.split('\n');
    let pairIndex = 0, fresh = true;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim()) { addSpace(gap); pairIndex = 0; fresh = true; continue; }
      if (SUBHEADING.test(fold(line.replace(/:$/, '').trim()))) { heading(line.replace(/:$/, '')); pairIndex = 0; fresh = true; continue; }
      const bullet = /^\s*[•●▪◦‣–—*-]\s+(.+)$/u.exec(line);
      if (bullet) {
        const wrapped = wrapPdfText(bullet[1], faces.regular, size, WIDTH - 27.35);
        wrapped.forEach((text, part) => rows.push({ type: 'text', height: leading, runs: [...(part === 0 ? [{ text: '•', font: 'regular', size, x: 13.5, color: INK }] : []), { text, font: 'regular', size, x: 27.35, color: INK }] }));
        pairIndex = 0; fresh = true; continue;
      }
      const pair = pairedParts(line);
      if (pair && key !== 'profile') {
        const hasDate = /\b(?:19|20)\d{2}\b|\b(?:present|current|atual|presente)\b/i.test(pair[1]);
        const font = pairIndex > 0 || hasDate ? 'italic' : 'bold';
        pairRow(...pair, { font, keepNext: lines[index + 1]?.trim() && !/^[•●▪◦‣–—*-]\s/.test(lines[index + 1]) ? 1 : 0 });
        pairIndex++; fresh = false; continue;
      }
      const shortTitle = key !== 'profile' && fresh && line.length < 130 && !!lines[index + 1]?.trim() && !/[.!?]$/.test(line);
      textRow(line, { font: shortTitle ? 'bold' : 'regular', keepNext: shortTitle ? 1 : 0 });
      fresh = false; pairIndex = 0;
    }
  };
  for (const key of ['profile', 'education', 'experience']) {
    if (!model[key]) continue;
    const first = model[key].split('\n').find(Boolean) || '';
    if (!(key === 'experience' && SUBHEADING.test(fold(first)))) heading(labels[key]);
    body(model[key], key);
  }
  if (model.skills || model.extra) {
    heading(labels.additional);
    const labelled = (label, value) => {
      label = label.replace(/:$/, '') + ':';
      const labelWidth = Math.min(132, Math.max(94, faces.italic.widthOfTextAtSize(label, size) + 12));
      const labelLines = wrapPdfText(label, faces.italic, size, labelWidth - 8), values = wrapPdfText(value, faces.regular, size, WIDTH - labelWidth);
      for (let index = 0; index < Math.max(labelLines.length, values.length); index++) rows.push({ type: 'text', height: leading, runs: [
        ...(labelLines[index] ? [{ text: labelLines[index], font: 'italic', size, x: 0, color: INK }] : []),
        ...(values[index] ? [{ text: values[index], font: 'regular', size, x: labelWidth, color: INK }] : []),
      ] });
    };
    const additional = (value, fallbackLabel = '') => {
      let fallbackUsed = false;
      for (const line of value.split('\n')) {
        if (!line.trim()) { addSpace(gap); continue; }
        const labelMatch = /^([^:\t]{1,40}):\s*(.+)$/.exec(line), pair = pairedParts(line);
        if (labelMatch) labelled(labelMatch[1], labelMatch[2]);
        else if (pair && pair[0].length <= 40) labelled(...pair);
        else if (fallbackLabel && !fallbackUsed) labelled(fallbackLabel, line);
        else textRow(line);
        fallbackUsed = true;
      }
    };
    if (model.skills) labelled(labels.skills, model.skills);
    if (model.extra) additional(model.extra);
  }
  while (rows.at(-1)?.type === 'space') rows.pop();
  return rows;
}
function paginate(rows) {
  const pages = [[]];
  let remaining = CONTENT_HEIGHT;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let needed = row.height;
    for (let look = 1; look <= (row.keepNext || 0) && rows[index + look]; look++) needed += rows[index + look].height;
    if (needed > remaining && pages.at(-1).length) { pages.push([]); remaining = CONTENT_HEIGHT; }
    if (row.type === 'space' && !pages.at(-1).length) continue;
    pages.at(-1).push(row); remaining -= row.height;
  }
  return pages;
}

/** One reference-based template. Fits spacing before type and never cuts facts. */
export async function createCVPdf(input, { template = 'rumo' } = {}) {
  if (template !== 'rumo') throw new Error('Escolhe o modelo Rumo disponível.');
  const model = normalizeModel(input), text = serializeCV(model);
  if (!text) throw new Error('Preenche o currículo antes de criar o PDF.');
  if (text.length > 60000) throw new Error('O currículo é demasiado extenso para este editor. Reduz o texto para menos de 60 000 caracteres.');
  const bytes = await fonts();
  bytes.forEach(value => validateGlyphs(text, value));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold, italic] = await Promise.all(bytes.map((value, index) => doc.embedFont(value, { subset: true, customName: `LiberationSerif-${['Regular', 'Bold', 'Italic'][index]}` })));
  const faces = { regular, bold, italic }, language = detectCVLanguage(Object.values(model).join('\n'));
  doc.setTitle(model.name ? `Currículo - ${model.name}` : 'Currículo');
  if (model.name) doc.setAuthor(model.name);
  doc.setSubject('Currículo profissional'); doc.setCreator('Rumo'); doc.setLanguage(language === 'en' ? 'en-GB' : 'pt-PT');
  const candidates = [[12, false], [12, true], [11.5, true], [11, true], [10.5, true], [10, true]];
  let chosen = null, defaultLayout;
  for (const [size, compact] of candidates) {
    const option = { pages: paginate(layoutCV(model, faces, size, compact, language)), size, compact };
    if (!defaultLayout) defaultLayout = option;
    if (option.pages.length === 1) { chosen = option; break; }
  }
  // If one page is impossible at a readable size, preserve 12 pt on more pages.
  chosen ||= defaultLayout;
  for (const [index, rows] of chosen.pages.entries()) {
    const page = doc.addPage(PAGE);
    let y = PAGE[1] - MARGIN;
    for (const row of rows) {
      if (row.type === 'rule') page.drawLine({ start: { x: MARGIN, y: y - 1 }, end: { x: PAGE[0] - MARGIN, y: y - 1 }, thickness: .55, color: INK });
      for (const run of row.runs || []) {
        if (!run.text) continue;
        page.drawText(run.text, { x: MARGIN + run.x, y: y - run.size, size: run.size, font: faces[run.font], color: run.color });
        if (run.underline) page.drawLine({ start: { x: MARGIN + run.x, y: y - run.size - 1.1 }, end: { x: MARGIN + run.x + faces[run.font].widthOfTextAtSize(run.text, run.size), y: y - run.size - 1.1 }, thickness: .55, color: INK });
      }
      y -= row.height;
    }
    if (chosen.pages.length > 1) {
      const label = `${index + 1} / ${chosen.pages.length}`;
      page.drawText(label, { x: PAGE[0] - MARGIN - regular.widthOfTextAtSize(label, 10), y: 18, size: 10, font: regular, color: INK });
    }
  }
  const stem = model.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 65);
  const message = chosen.pages.length > 1 ? `O conteúdo foi preservado em ${chosen.pages.length} páginas, com letra de 12 pt.` : chosen.size < 12 ? `Espaçamento e letra ajustados para ${chosen.size} pt, sem retirar conteúdo.` : 'Modelo formatado numa página, sem retirar conteúdo.';
  return { bytes: await doc.save(), pageCount: chosen.pages.length, filename: stem ? `CV-${stem}.pdf` : 'CV.pdf', template: 'rumo', fitInfo: { bodyFontSize: chosen.size, compactSpacing: chosen.compact, onePage: chosen.pages.length === 1, contentPreserved: true, message } };
}
