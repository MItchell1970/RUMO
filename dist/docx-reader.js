import pako from './vendor/pako.min.mjs';
import sax from './vendor/sax.mjs';

const MAX_XML = 6 * 1024 * 1024;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WS = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
const invalid = () => new Error('Não foi possível ler este DOCX. Guarda novamente o documento no Word ou cola o texto.');

/** ZIP central-directory reader: bounded sizes, no filesystem extraction or external references. */
export function readDocxParts(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 22) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw invalid();
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  if (count > 2000 || at + centralSize > end) throw invalid();
  const parts = new Map();
  let totalExpanded = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const expanded = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    if (at + 46 + nameLength + extraLength + commentLength > end) throw invalid();
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    totalExpanded += expanded;
    if (totalExpanded > 25 * 1024 * 1024) throw new Error('O DOCX é demasiado complexo. Exporta uma versão mais simples ou cola o texto.');
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)) continue;
    if (parts.has(name) || flags & 1 || ![0, 8].includes(method) || expanded > MAX_XML || compressed > bytes.length || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw invalid();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > bytes.length) throw invalid();
    const data = bytes.subarray(start, start + compressed);
    let unpacked;
    if (method === 0) unpacked = data;
    else {
      const inflate = new pako.Inflate({ raw: true, chunkSize: 65536 });
      const chunks = [];
      let size = 0;
      inflate.onData = chunk => {
        size += chunk.length;
        if (size > expanded || size > MAX_XML) throw invalid();
        chunks.push(chunk);
      };
      inflate.push(data, true);
      if (inflate.err) throw invalid();
      unpacked = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { unpacked.set(chunk, offset); offset += chunk.length; }
    }
    if (unpacked.length !== expanded) throw invalid();
    parts.set(name, new TextDecoder('utf-8', { fatal: true }).decode(unpacked));
  }
  if (!parts.has('word/document.xml')) throw invalid();
  return parts;
}

/** WordprocessingML text only. Runs remain contiguous; table columns are paired by row/line. */
export function extractDocxXml(xml) {
  if (xml.length > MAX_XML || /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw invalid();
  const root = { name: 'root', children: [] };
  const stack = [root];
  const parser = sax.parser(true, { xmlns: true, trim: false, normalize: false });
  let count = 0;
  parser.onopentag = tag => {
    if (++count > 100000 || stack.length > 128) throw invalid();
    const node = { name: [W, WS].includes(tag.uri) ? tag.local : '', children: [] };
    stack.at(-1).children.push(node); stack.push(node);
  };
  parser.ontext = text => { if (stack.at(-1).name === 't') stack.at(-1).children.push(text); };
  parser.onclosetag = () => { stack.pop(); };
  parser.onerror = () => { throw invalid(); };
  parser.write(xml).close();
  const textOf = node => {
    if (typeof node === 'string') return node;
    if (['del', 'moveFrom', 'instrText'].includes(node.name)) return '';
    if (node.name === 'tab') return '\t';
    if (['br', 'cr'].includes(node.name)) return '\n';
    return node.children.map(textOf).join('');
  };
  const has = (node, name) => typeof node === 'object' && (node.name === name || node.children.some(child => has(child, name)));
  const paragraph = node => {
    const value = textOf(node).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    return value && has(node, 'numPr') && !/^[•●▪\-\d]/.test(value) ? `• ${value}` : value;
  };
  const direct = (node, name) => node.children.filter(child => typeof child === 'object' && child.name === name);
  function content(node) {
    if (typeof node === 'string' || ['del', 'moveFrom'].includes(node.name)) return [];
    if (node.name === 'p') return [paragraph(node)];
    if (node.name === 'tbl') {
      const result = [];
      for (const row of direct(node, 'tr')) {
        const cells = direct(row, 'tc').map(cell => content(cell).flatMap(value => value.split('\n')));
        const rows = Math.max(0, ...cells.map(cell => cell.length));
        for (let index = 0; index < rows; index++) {
          // A tab encodes genuine left/right alignment for the editable template.
          const line = cells.map(cell => cell[index]?.trim() || '').filter(Boolean).join('\t');
          if (line) result.push(line);
        }
      }
      return result;
    }
    return node.children.flatMap(content);
  }
  return content(root).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractDocxText(bytes) {
  const parts = readDocxParts(bytes);
  const order = [...parts.keys()].sort((a, b) => {
    const rank = name => name.includes('/header') ? 0 : name === 'word/document.xml' ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
  });
  const result = order.map(name => extractDocxXml(parts.get(name))).filter(Boolean).join('\n\n');
  if (result.length > 30000) throw new Error('O DOCX contém demasiado texto. Usa até 30 000 caracteres.');
  if (!result.trim()) throw new Error('O DOCX não contém texto legível. Cola o texto do currículo.');
  return result;
}
