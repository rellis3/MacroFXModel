// PDF text extraction off the main thread (server.js _pdfText). pdf-parse is CPU-bound: run on the main loop it
// stalled every request while the research pod read papers (2026-11-06), long enough for Railway to restart the server.
import { parentPort, workerData } from 'node:worker_threads';
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
try {
  const opts = workerData.max ? { max: workerData.max } : {};
  const parsed = await pdfParse(Buffer.from(workerData.buf), opts);
  parentPort.postMessage({ ok: true, text: parsed.text ?? '', pages: parsed.numpages ?? null });
} catch (e) { parentPort.postMessage({ ok: false, error: String(e?.message ?? e).slice(0, 300) }); }
