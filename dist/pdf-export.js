import { PDFDocument, rgb } from './vendor/pdf-lib.min.mjs';
import fontkit from './vendor/fontkit.min.mjs';
import { normalizeModel, serializeCV } from './cv-model.js';

const PAGE = [595.28, 841.89];
const MARGIN = 54;
const BODY = 11;
const LINE = 15;
const SECTIONS = [['profile', 'Perfil'], ['education', 'Formação académica'], ['experience', 'Experiência e projetos'], ['skills', 'Competências'], ['extra', 'Informações adicionais']];
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
  if (!fontBytesPromise) fontBytesPromise = Promise.all(['./vendor/LiberationSans-Regular.ttf', './vendor/LiberationSans-Bold.ttf'].map(assetBytes)).catch(error => { fontBytesPromise = null; throw error; });
  return fontBytesPromise;
}

function validateGlyphs(text, bytes) {
  const face = fontkit.create(bytes);
  const unsupported = [...new Set([...text].filter(character => !/[\n\r\t]/.test(character) && !face.hasGlyphForCodePoint(character.codePointAt(0))))];
  if (unsupported.length) {
    const sample = unsupported.slice(0, 5).map(character => `${character} (U+${character.codePointAt(0).toString(16).toUpperCase()})`).join(', ');
    throw new Error(`A fonte deste modelo não suporta: ${sample}. Substitui apenas os símbolos decorativos, ou escolhe uma ferramenta com uma fonte que preserve estes caracteres. O PDF não foi criado para evitar perder nomes ou texto.`);
  }
}

/** Wraps at word boundaries and splits long tokens without omitting any character. */
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

/** Produces a new clean CV from reviewed facts. It never generates experience or scores. */
export async function createCVPdf(input, { template = 'minimal' } = {}) {
  if (!['minimal', 'classic'].includes(template)) throw new Error('Escolhe um dos modelos disponíveis.');
  const model = normalizeModel(input);
  const text = serializeCV(model);
  if (!text) throw new Error('Preenche o currículo antes de criar o PDF.');
  if (text.length > 60000) throw new Error('O currículo é demasiado extenso para este editor. Reduz o texto para menos de 60 000 caracteres.');
  const [regularBytes, boldBytes] = await fonts();
  validateGlyphs(text, regularBytes);
  validateGlyphs([model.name, ...SECTIONS.map(([, title]) => title)].join('\n'), boldBytes);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true, customName: 'LiberationSans-Regular' });
  const bold = await doc.embedFont(boldBytes, { subset: true, customName: 'LiberationSans-Bold' });
  doc.setTitle(model.name ? `Currículo - ${model.name}` : 'Currículo');
  if (model.name) doc.setAuthor(model.name);
  doc.setSubject('Currículo profissional');
  doc.setCreator('Rumo');
  doc.setLanguage('pt-PT');
  const ink = rgb(0.13, 0.16, 0.15);
  const accent = template === 'minimal' ? rgb(0.14, 0.31, 0.26) : rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.29, 0.33, 0.31);
  const width = PAGE[0] - 2 * MARGIN;
  let page;
  let y;
  function addPage() { page = doc.addPage(PAGE); y = PAGE[1] - MARGIN; }
  function ensureRoom(height) { if (y - height < MARGIN) addPage(); }
  function drawLines(lines, font = regular, size = BODY, color = ink, leading = LINE) {
    for (const line of lines) {
      ensureRoom(leading);
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= leading;
    }
  }
  function block(value, font = regular, size = BODY, color = ink, leading = LINE) {
    drawLines(wrapPdfText(value, font, size, width), font, size, color, leading);
  }
  addPage();
  if (model.name) { block(model.name, bold, 24, accent, 29); y -= 4; }
  if (model.headline) { block(model.headline, regular, 13, muted, 18); y -= 3; }
  if (model.contact) { block(model.contact, regular, BODY, muted); y -= 5; }
  if (model.name || model.headline || model.contact) {
    ensureRoom(10);
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE[0] - MARGIN, y: y - 2 }, thickness: template === 'minimal' ? 1.3 : 0.6, color: accent });
    y -= 15;
  }
  for (const [key, title] of SECTIONS) {
    if (!model[key]) continue;
    const lines = wrapPdfText(model[key], regular, BODY, width);
    // Keep a section heading with at least its first two body lines.
    ensureRoom(27 + Math.min(2, lines.length) * LINE);
    block(title, bold, 11, accent, 16);
    y -= 4;
    drawLines(lines);
    y -= 13;
  }
  const pages = doc.getPages();
  if (pages.length > 1) for (let index = 0; index < pages.length; index++) {
    const label = `${index + 1} / ${pages.length}`;
    pages[index].drawText(label, { x: PAGE[0] - MARGIN - regular.widthOfTextAtSize(label, 10), y: 30, size: 10, font: regular, color: muted });
  }
  const stem = model.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 65);
  return { bytes: await doc.save(), pageCount: pages.length, filename: stem ? `CV-${stem}.pdf` : 'CV.pdf' };
}
