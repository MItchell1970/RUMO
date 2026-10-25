/** PDF/TXT import runs locally. Geometry is approximate and is not a visual review. */
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

const positive = (value) => Number.isFinite(value) && value > 0;
const round = (value) => Math.round(value * 100) / 100;

function weightedMedian(weights, total) {
  let cumulative = 0;
  for (const [value, weight] of [...weights].sort((a, b) => a[0] - b[0])) {
    cumulative += weight;
    if (cumulative >= total / 2) return value;
  }
  return null;
}

// PDF subset prefixes and weight/style suffixes do not identify a new family.
// PDF.js resource IDs and generic fallback families reveal no original family.
function fontFamily(item, style) {
  for (const candidate of [style?.originalFontName, style?.fontFamily, item.fontName]) {
    if (typeof candidate !== 'string') continue;
    let name = candidate.trim().replace(/^["']|["']$/g, '').replace(/^(?:[A-Z]{6}\+)+/, '');
    if (!name || /^(?:g_d\d+_f\w+|f\d+|font\d+|sans-serif|serif|monospace|cursive|fantasy|system-ui)$/i.test(name)) continue;
    name = name.replace(/(?:PSMT|MT)$/i, '').replace(/(?:[-,\s]?(?:extra|semi|demi)?bold(?:italic|oblique)?|[-,\s]?(?:italic|oblique)|[-,\s](?:regular|roman|normal|book|medium))$/i, '');
    name = name.toLowerCase().replace(/[\s_,-]/g, '');
    if (name) return name;
  }
  return null;
}

function itemGeometry(item, style, unit, size) {
  const t = item.transform;
  if (!t || t.length < 6 || !Array.from(t).slice(0, 6).every(Number.isFinite) || !positive(item.width)) return null;
  const horizontalSize = Math.hypot(t[0], t[1]);
  if (!positive(horizontalSize) || !positive(size)) return null;
  const hx = t[0] / horizontalSize;
  const hy = t[1] / horizontalSize;
  // Ascent/descent position the text around its baseline. The em fallback is
  // intentionally approximate; item.height is not a reliable font-size metric.
  const ascent = Number.isFinite(style?.ascent) && style.ascent > 0 && style.ascent <= 2 ? style.ascent : 0.8;
  const descent = Number.isFinite(style?.descent) && style.descent <= 0 && style.descent >= -1 ? style.descent : -0.2;
  const points = [0, item.width].flatMap((advance) => [descent, ascent].map((vertical) => [
    (t[4] + hx * advance + t[2] * vertical) * unit,
    (t[5] + hy * advance + t[3] * vertical) * unit,
  ]));
  const box = [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
  if (!box.every(Number.isFinite)) return null;
  const horizontal = Math.abs(hy) < 0.0001 && Math.abs(t[2]) * unit < size * 0.0001;
  const vertical = Math.abs(hx) < 0.0001 && Math.abs(t[3]) * unit < size * 0.0001;
  return { box, axis: horizontal ? 0 : vertical ? 1 : null, baseline: (horizontal ? t[5] : t[4]) * unit, size };
}

// Exact union of axis-aligned rectangles: coincident text runs are counted once.
// A sweep line and interval tree keep this bounded at O(n log n), including PDFs
// that split every word or character into a separate text item.
function rectangleUnionArea(boxes) {
  if (!boxes.length) return 0;
  const ys = [...new Set(boxes.flatMap((box) => [box[1], box[3]]))].sort((a, b) => a - b);
  const indexes = new Map(ys.map((y, index) => [y, index]));
  const events = boxes.flatMap(([x0, y0, x1, y1]) => [[x0, indexes.get(y0), indexes.get(y1) - 1, 1], [x1, indexes.get(y0), indexes.get(y1) - 1, -1]]).sort((a, b) => a[0] - b[0]);
  const coverage = new Int32Array(ys.length * 4);
  const lengths = new Float64Array(ys.length * 4);
  function update(node, left, right, start, end, delta) {
    if (start <= left && right <= end) coverage[node] += delta;
    else {
      const mid = (left + right) >> 1;
      if (start <= mid) update(node * 2, left, mid, start, end, delta);
      if (end > mid) update(node * 2 + 1, mid + 1, right, start, end, delta);
    }
    lengths[node] = coverage[node] > 0 ? ys[right + 1] - ys[left] : left === right ? 0 : lengths[node * 2] + lengths[node * 2 + 1];
  }
  let area = 0;
  let previousX = events[0][0];
  for (const [x, start, end, delta] of events) {
    area += (x - previousX) * lengths[1];
    update(1, 0, ys.length - 2, start, end, delta);
    previousX = x;
  }
  return area;
}

function mergeSpans(spans) {
  const merged = [];
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

function overlappingSpanLength(a, b) {
  let overlap = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    overlap += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]));
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return overlap;
}

function lineSpacing(geometries) {
  let pairs = 0;
  let tight = 0;
  for (const axis of [0, 1]) {
    const lines = [];
    for (const item of geometries.filter((g) => g.axis === axis).sort((a, b) => a.baseline - b.baseline)) {
      let line = lines.at(-1);
      // Join fragments on one baseline before measuring line-to-line spacing.
      if (!line || item.baseline - line.baseline > Math.min(2, Math.min(item.size, line.size) * 0.18)) {
        line = { baseline: item.baseline, size: item.size, spans: [] };
        lines.push(line);
      }
      line.size = Math.max(line.size, item.size);
      line.spans.push(axis === 0 ? [item.box[0], item.box[2]] : [item.box[1], item.box[3]]);
    }
    for (const line of lines) {
      line.spans = mergeSpans(line.spans);
      line.width = line.spans.reduce((sum, [start, end]) => sum + end - start, 0);
    }
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // A nearby line must overlap in the reading direction. This avoids
      // treating staggered columns as successive tightly spaced lines.
      for (let j = i - 1; j >= 0 && i - j <= 64; j--) {
        const previous = lines[j];
        const distance = line.baseline - previous.baseline;
        const height = Math.max(line.size, previous.size);
        if (distance > line.size * 2.5) break;
        if (height / Math.min(line.size, previous.size) > 1.35) continue;
        if (overlappingSpanLength(line.spans, previous.spans) < Math.min(line.width, previous.width) * 0.25) continue;
        pairs++;
        if (distance < height * 1.15) tight++;
        break;
      }
    }
  }
  return { pairs, tight };
}

/**
 * Pages use unscaled PDF user-space coordinates, with origin at the crop-box
 * bottom-left. width/height and item geometry are multiplied by userUnit once.
 * Font size is character-weighted; spacing groups fragments on the same baseline.
 * Density covers text-run boxes, excluding images and decoration. Arbitrarily
 * rotated/skewed runs make density/spacing unknown rather than inflating them.
 * Missing required data on any text page makes that whole-document metric null.
 *
 * @param {Array<{items:Array,userUnit?:number,width?:number,height?:number,styles?:Object}>} pages
 */
export function getPdfMetadata(pages) {
  if (!Array.isArray(pages)) throw new TypeError('As páginas do PDF devem ser uma lista.');
  let characters = 0;
  let smallCharacters = 0;
  let fontComplete = true;
  let geometryComplete = true;
  let axisAligned = true;
  let familiesComplete = true;
  let minMargin = Infinity;
  let area = 0;
  let textArea = 0;
  let pairs = 0;
  let tight = 0;
  const weights = new Map();
  const families = new Set();
  for (const page of pages) {
    const unit = positive(page?.userUnit) ? page.userUnit : 1;
    const width = page?.width * unit;
    const height = page?.height * unit;
    const dimensionsKnown = positive(width) && positive(height);
    if (!dimensionsKnown) geometryComplete = false;
    else area += width * height;
    const geometries = [];
    const boxes = [];
    for (const item of Array.isArray(page?.items) ? page.items : []) {
      if (typeof item?.str !== 'string') continue;
      const weight = countCharacters(item.str);
      if (!weight) continue;
      characters += weight;
      const style = page?.styles?.[item.fontName];
      const family = fontFamily(item, style);
      if (family) families.add(family); else familiesComplete = false;
      const t = item.transform;
      const size = t?.length >= 4 && Number.isFinite(t[2]) && Number.isFinite(t[3]) ? Math.hypot(t[2], t[3]) * unit : NaN;
      if (!positive(size)) { fontComplete = false; geometryComplete = false; continue; }
      if (size < 10) smallCharacters += weight;
      weights.set(size, (weights.get(size) || 0) + weight);
      const geometry = itemGeometry(item, style, unit, size);
      if (!geometry) { geometryComplete = false; continue; }
      if (geometry.axis === null) axisAligned = false;
      geometries.push(geometry);
      if (dimensionsKnown) {
        const [x0, y0, x1, y1] = geometry.box;
        minMargin = Math.min(minMargin, x0, y0, width - x1, height - y1);
        const clipped = [Math.max(0, x0), Math.max(0, y0), Math.min(width, x1), Math.min(height, y1)];
        if (clipped[0] < clipped[2] && clipped[1] < clipped[3]) boxes.push(clipped);
      }
    }
    if (dimensionsKnown) textArea += rectangleUnionArea(boxes);
    const spacing = lineSpacing(geometries);
    pairs += spacing.pairs;
    tight += spacing.tight;
  }
  const measured = characters > 0;
  return {
    pageCount: pages.length,
    smallTextRatio: measured && fontComplete ? smallCharacters / characters : null,
    bodyFontSize: measured && fontComplete ? Math.round(weightedMedian(weights, characters) * 10) / 10 : null,
    minMarginPt: measured && geometryComplete && Number.isFinite(minMargin) ? round(Math.max(0, minMargin)) : null,
    tightLineRatio: measured && geometryComplete && axisAligned && pairs > 0 ? tight / pairs : null,
    textDensity: measured && geometryComplete && axisAligned && area > 0 ? Math.min(1, textArea / area) : null,
    fontFamilyCount: measured && familiesComplete && families.size ? families.size : null,
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
        const unit = positive(page.userUnit) ? page.userUnit : 1;
        // PDF.js includes userUnit in viewport.scale. Cancel it here so the
        // metadata function performs the conversion to points exactly once.
        // A zero-rotation viewport also normalises non-zero crop-box origins.
        const viewport = page.getViewport({ scale: 1 / unit, rotation: 0, dontFlip: true });
        const styles = Object.fromEntries(Object.entries(content.styles || {}).map(([key, style]) => [key, { ...style }]));
        // Text extraction exposes fallback families. The operator list makes
        // original font objects available in this pinned PDF.js build without
        // painting the page; unavailable identities remain unknown.
        try { await wait(page.getOperatorList()); }
        catch (error) {
          // Optional font inspection must not turn readable text into an import
          // failure. A real deadline still aborts the document and its worker.
          if (error instanceof CVReadError) throw error;
        }
        for (const [key, style] of Object.entries(styles)) {
          try {
            if (page.commonObjs?.has(key)) {
              const name = page.commonObjs.get(key)?.name;
              if (typeof name === 'string') style.originalFontName = name;
            }
          } catch { /* Font identity is optional metadata. */ }
        }
        const [a, b, c, d, e, f] = viewport.transform;
        const items = content.items.map((item) => {
          const t = item.transform;
          if (!t || t.length < 6) return item;
          return { ...item, transform: [a * t[0] + c * t[1], b * t[0] + d * t[1], a * t[2] + c * t[3], b * t[2] + d * t[3], a * t[4] + c * t[5] + e, b * t[4] + d * t[5] + f] };
        });
        pages.push({ items, userUnit: unit, width: viewport.width, height: viewport.height, styles });
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
