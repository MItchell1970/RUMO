/** Local PT-PT and English spelling checks. CV text stays in a local Web Worker. */
let worker;
let sequence = 0;
const pending = new Map();
const TIMEOUT_MS = 25000;
const unavailable = (error) => ({ ready: false, issues: [], error });

function stopWorker(message) {
  worker?.terminate();
  worker = undefined;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.resolve(unavailable(message));
  }
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./writing-worker.js', import.meta.url));
  worker.addEventListener('message', ({ data }) => {
    const entry = pending.get(data?.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(data.id);
    const result = data.result;
    entry.resolve(result && typeof result.ready === 'boolean' && Array.isArray(result.issues)
      ? result
      : unavailable('Não foi possível interpretar a revisão ortográfica. Tenta novamente.'));
  });
  worker.addEventListener('error', () => stopWorker('A revisão ortográfica não carregou. Confirma a ligação e tenta novamente.'));
  worker.addEventListener('messageerror', () => stopWorker('A revisão ortográfica foi interrompida. Tenta novamente.'));
  return worker;
}

/**
 * @param {string} text Up to 30,000 UTF-16 code units; never sent to an external service.
 * @param {{ignoredWords?: string[]}} options User-confirmed names/technical terms.
 * @returns {Promise<{ready:boolean,issues:Array,error?:string,limited?:boolean}>}
 */
export async function checkWriting(text, { ignoredWords = [] } = {}) {
  if (typeof text !== 'string') return unavailable('A revisão ortográfica precisa de texto.');
  if (text.length > 30000) return unavailable('A revisão ortográfica aceita até 30 000 caracteres. Encurta o texto e volta a tentar.');
  if (!text.trim()) return { ready: true, issues: [] };
  if (typeof Worker === 'undefined') return unavailable('Este navegador não permite carregar a revisão ortográfica local.');
  const words = Array.isArray(ignoredWords)
    ? ignoredWords.filter((word) => typeof word === 'string' && word.length <= 60).slice(0, 500)
    : [];
  return new Promise((resolve) => {
    const id = ++sequence;
    const timer = setTimeout(() => stopWorker('A revisão ortográfica demorou demasiado. Tenta novamente num navegador atualizado.'), TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try { getWorker().postMessage({ id, text, ignoredWords: words }); }
    catch { stopWorker('Não foi possível iniciar a revisão ortográfica local. Tenta novamente.'); }
  });
}

/** Releases pending text and worker memory when the person clears their CV. */
export function clearWriting() {
  stopWorker('A revisão ortográfica foi cancelada.');
}
