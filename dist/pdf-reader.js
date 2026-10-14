/** PDF/TXT import runs locally. Font metrics are approximate signals, not a visual review. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 12;
const MAX_CHARACTERS = 30000;
const READ_TIMEOUT_MS = 25000;

class CVReadError extends Error {}
const problem = (message) => new CVReadError(message);
const tooMuchText = () => problem('O ficheiro contém demasiado texto. Cola apenas o currículo, até 30 000 caracteres.');

function countCharacters(text) {
  return [...text.normalize('NFC').replace(/\s/gu, '')].length;
}

/**
 * Character-weighted measurements from PDF.js text items in page user-space units.
 * The PDF.js vertical text transform gives the approximate em size; multiplying
 * page.userUnit converts it to points (1/72 inch). item.height is deliberately not
 * used: it can describe a glyph/run bounding box instead of the font size.
 *
 * @param {Array<{items:Array, userUnit?:number}>} pages
 * @returns {{pageCount:number, smallTextRatio:number|null, bodyFontSize:number|null}}
 */
export function getPdfMetadata(pages) {
  if (!Array.isArray(pages)) throw new TypeError('As páginas do PDF devem ser uma lista.');
  let measuredCharacters = 0;
  let smallCharacters = 0;
  const weights = new Map();
  for (const page of pages) {
    const unit = Number.isFinite(page?.userUnit) && page.userUnit > 0 ? page.userUnit : 1;
    for (const item of Array.isArray(page?.items) ? page.items : []) {
      if (typeof item?.str !== 'string' || !item.transform || item.transform.length < 4) continue;
      const c = item.transform[2];
      const d = item.transform[3];
      if (!Number.isFinite(c) || !Number.isFinite(d)) continue;
      const size = Math.hypot(c, d) * unit;
      if (!Number.isFinite(size) || size <= 0) continue;
      const weight = countCharacters(item.str);
      if (!weight) continue;
      measuredCharacters += weight;
      if (size < 10) smallCharacters += weight;
      weights.set(size, (weights.get(size) || 0) + weight);
    }
  }
  if (!measuredCharacters) return { pageCount: pages.length, smallTextRatio: null, bodyFontSize: null };
  let cumulative = 0;
  let median = 0;
  for (const [size, weight] of [...weights].sort((a, b) => a[0] - b[0])) {
    cumulative += weight;
    if (cumulative >= measuredCharacters / 2) { median = size; break; }
  }
  return {
    pageCount: pages.length,
    smallTextRatio: smallCharacters / measuredCharacters,
    bodyFontSize: Math.round(median * 10) / 10,
  };
}

function withDeadline(promise, deadline, onTimeout = () => {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(problem('A leitura do ficheiro demorou demasiado. Tenta um PDF mais simples ou cola o texto do currículo.'));
    }, Math.max(0, deadline - Date.now()));
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function cleanText(text) {
  if (typeof text !== 'string') throw problem('Não foi possível ler o texto do ficheiro.');
  if (text.length > MAX_CHARACTERS) throw tooMuchText();
  const cleaned = text.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').trim();
  if (!cleaned) throw problem('O ficheiro está vazio ou não contém texto. Cola o texto do currículo.');
  return cleaned;
}

function pageText(items, remaining) {
  let text = '';
  let previousBaseline = null;
  let previousEnd = null;
  for (const item of items) {
    if (typeof item?.str !== 'string' || !item.str) continue;
    const transform = item.transform;
    const size = transform ? Math.hypot(transform[2], transform[3]) : NaN;
    const hasGeometry = transform?.length >= 6 && Number.isFinite(size) && size > 0
      && Number.isFinite(transform[4]) && Number.isFinite(transform[5]);
    const vertical = hasGeometry ? [transform[2] / size, transform[3] / size] : null;
    const baseline = hasGeometry ? transform[4] * vertical[0] + transform[5] * vertical[1] : null;
    const start = hasGeometry ? transform[4] * vertical[1] - transform[5] * vertical[0] : null;
    if (text && !/\s$/u.test(text) && !/^\s/u.test(item.str)) {
      if (baseline !== null && previousBaseline !== null && Math.abs(baseline - previousBaseline) > 3) text += '\n';
      else if (start === null || previousEnd === null || start - previousEnd > size * 0.12 || start < previousEnd - size) text += ' ';
    }
    if (text.length + item.str.length + Number(Boolean(item.hasEOL)) > remaining) throw tooMuchText();
    text += item.str;
    if (item.hasEOL) text += '\n';
    previousBaseline = baseline;
    previousEnd = start !== null && Number.isFinite(item.width) ? start + Math.abs(item.width) : null;
  }
  return text;
}

async function readPdf(file, deadline) {
  let task;
  let destroyPromise;
  const destroy = () => {
    if (!task) return Promise.resolve();
    destroyPromise ||= Promise.resolve().then(() => task.destroy()).catch(() => {});
    return destroyPromise;
  };
  const wait = (promise) => withDeadline(promise, deadline, () => { void destroy(); });
  try {
    const bytes = new Uint8Array(await wait(file.arrayBuffer()));
    if (bytes.byteLength > MAX_BYTES) throw problem('O ficheiro ultrapassa 5 MB. Escolhe uma versão mais pequena ou cola o texto do CV.');
    if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
      throw problem('Este ficheiro não parece ser um PDF válido. Exporta novamente o currículo ou cola o texto.');
    }
    const pdfjs = await wait(import('./vendor/pdf.min.mjs'));
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
    task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
    const pdf = await wait(task.promise);
    if (pdf.numPages > MAX_PAGES) throw problem('O PDF tem mais de 12 páginas. Importa apenas as páginas do teu currículo.');
    const pages = [];
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await wait(pdf.getPage(pageNumber));
      try {
        const content = await wait(page.getTextContent());
        if (pageNumber > 1) text += '\n\n';
        text += pageText(content.items, MAX_CHARACTERS - text.length);
        pages.push({ items: content.items, userUnit: page.userUnit });
      } finally { page.cleanup(); }
    }
    text = cleanText(text);
    if ((text.match(/[\p{L}\p{N}]+/gu) || []).length < 15) {
      throw problem('Não foi possível extrair texto suficiente. O PDF pode ser uma imagem. Cola o texto ou usa um PDF com texto selecionável.');
    }
    return { text, metadata: getPdfMetadata(pages), name: file.name, kind: 'pdf' };
  } finally {
    // Cleanup is also bounded; it must not hide the original parsing error.
    await withDeadline(destroy(), Date.now() + 1500).catch(() => {});
  }
}

/** Import a user-selected PDF or UTF-8 TXT; content is never uploaded. */
export async function readCVFile(file) {
  if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size) || file.size < 0) {
    throw problem('Escolhe um ficheiro PDF ou TXT. Também podes colar o texto diretamente.');
  }
  if (!/\.(?:pdf|txt)$/i.test(file.name)) throw problem('Escolhe um ficheiro PDF ou TXT. Também podes colar o texto diretamente.');
  if (file.size > MAX_BYTES) throw problem('O ficheiro ultrapassa 5 MB. Escolhe uma versão mais pequena ou cola o texto do CV.');
  if (!file.size) throw problem('O ficheiro está vazio. Escolhe outro ficheiro ou cola o texto do currículo.');
  const deadline = Date.now() + READ_TIMEOUT_MS;
  try {
    if (/\.txt$/i.test(file.name)) {
      const original = await withDeadline(file.text(), deadline);
      if (original.includes('\0') || original.includes('\uFFFD')) {
        throw problem('Não foi possível interpretar este TXT. Guarda-o com codificação UTF-8 ou cola o texto do currículo.');
      }
      return { text: cleanText(original), metadata: null, name: file.name, kind: 'txt' };
    }
    return await readPdf(file, deadline);
  } catch (error) {
    if (error instanceof CVReadError) throw error;
    if (error?.name === 'PasswordException') throw problem('Este PDF está protegido por palavra-passe. Usa uma cópia sem proteção ou cola o texto.');
    if (error?.name === 'InvalidPDFException') throw problem('Não foi possível abrir este PDF. Exporta novamente o currículo ou cola o texto.');
    throw problem('Não foi possível ler este ficheiro. Tenta outro PDF ou cola o texto do currículo.');
  }
}
