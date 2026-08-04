const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');

const DEFAULT_PDF_RENDER_TIMEOUT_MS = 30000;
const DEFAULT_PDF_WORKER_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PDF_MAX_PAGE_PIXELS = 16 * 1000 * 1000;
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_STANDARD_FONT_DATA_PATH = `${path.join(PDFJS_ROOT, 'standard_fonts')}${path.sep}`;
const PDFJS_STANDARD_FONT_DATA_URL = pathToFileURL(PDFJS_STANDARD_FONT_DATA_PATH).href;
const PDF_WORKER_PATH = path.join(__dirname, 'GambiranResumePdfWorker.js');

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isPdf(buffer, mimeType, filename) {
  return trim(mimeType).toLowerCase().includes('pdf')
    || path.extname(trim(filename)).toLowerCase() === '.pdf'
    || Buffer.from(buffer).subarray(0, 5).toString('ascii') === '%PDF-';
}

function isImage(mimeType, filename) {
  return trim(mimeType).toLowerCase().startsWith('image/')
    || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif']
      .includes(path.extname(trim(filename)).toLowerCase());
}

function pdfRenderTimeoutMs() {
  const configured = Number(process.env.GAMBIRAN_RESUME_PDF_RENDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PDF_RENDER_TIMEOUT_MS;
}

function positiveNumber(value, fallback) {
  const configured = Number(value);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

async function withTimeout(promise, timeoutMs, message, onTimeout) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.(); } catch {}
      reject(new Error(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function imageToJpeg(buffer) {
  return sharp(buffer, { animated: false, failOn: 'warning' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function emitJpeg(item, pages, options) {
  if (typeof options.onPage === 'function') {
    await options.onPage(item);
    return;
  }
  pages.push(item);
}

async function pdfToJpegsInProcess(buffer, options = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
  });
  const timeoutMs = pdfRenderTimeoutMs();
  const document = await withTimeout(
    loadingTask.promise,
    timeoutMs,
    'Membuka PDF melebihi batas waktu',
    () => loadingTask.destroy()
  );
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxPixels = positiveNumber(process.env.GAMBIRAN_RESUME_PDF_MAX_PAGE_PIXELS, DEFAULT_PDF_MAX_PAGE_PIXELS);
      const requestedScale = 2;
      const boundedScale = Math.sqrt(maxPixels / Math.max(1, baseViewport.width * baseViewport.height));
      const viewport = page.getViewport({ scale: Math.max(0.1, Math.min(requestedScale, boundedScale)) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const renderTask = page.render({ canvasContext: context, viewport, canvas });
        await withTimeout(
          renderTask.promise,
          timeoutMs,
          `Render PDF halaman ${pageNumber} melebihi batas waktu`,
          () => renderTask.cancel()
        );
        const item = { page: pageNumber, buffer: await imageToJpeg(canvas.toBuffer('image/png')) };
        await emitJpeg(item, pages, options);
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

async function pdfToJpegsIsolated(buffer, options = {}) {
  const timeoutMs = positiveNumber(process.env.GAMBIRAN_RESUME_PDF_WORKER_TIMEOUT_MS, DEFAULT_PDF_WORKER_TIMEOUT_MS);
  const child = spawn(process.execPath, [PDF_WORKER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, GAMBIRAN_RESUME_PDF_WORKER: '1' },
  });
  let diagnostic = '';
  child.stderr.on('data', chunk => {
    diagnostic = `${diagnostic}${chunk.toString('utf8')}`.slice(-4000);
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  child.stdin.on('error', () => {});
  child.stdin.end(buffer);
  const pages = [];
  let pending = '';

  async function consume(line) {
    if (!line.startsWith('JPG\t')) {
      if (line.trim()) diagnostic = `${diagnostic}\n${line}`.slice(-4000);
      return;
    }
    const payload = JSON.parse(line.slice(4));
    if (!Number.isInteger(payload.page) || payload.page < 1 || typeof payload.jpeg !== 'string') {
      throw new Error('Worker PDF mengembalikan payload halaman tidak valid');
    }
    await emitJpeg({ page: payload.page, buffer: Buffer.from(payload.jpeg, 'base64') }, pages, options);
  }

  try {
    for await (const chunk of child.stdout) {
      pending += chunk.toString('utf8');
      let lineEnd;
      while ((lineEnd = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, lineEnd).replace(/\r$/, '');
        pending = pending.slice(lineEnd + 1);
        await consume(line);
      }
    }
    if (pending.trim()) await consume(pending.replace(/\r$/, ''));
    const result = await closed;
    if (timedOut) throw new Error('Raster PDF melebihi batas waktu worker');
    if (result.code !== 0) {
      const detail = diagnostic.trim().split(/\r?\n/).pop();
      throw new Error(`Worker raster PDF gagal${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return pages;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

async function pdfToJpegs(buffer, options = {}) {
  return options.isolatePdf
    ? pdfToJpegsIsolated(buffer, options)
    : pdfToJpegsInProcess(buffer, options);
}

async function convertToJpegs(buffer, mimeType, filename, options = {}) {
  if (isPdf(buffer, mimeType, filename)) return pdfToJpegs(buffer, options);
  if (isImage(mimeType, filename)) {
    const pages = [];
    await emitJpeg({ page: 1, buffer: await imageToJpeg(buffer) }, pages, options);
    return pages;
  }
  return [];
}

module.exports = {
  convertToJpegs,
  imageToJpeg,
  pdfToJpegs,
  pdfToJpegsInProcess,
  pdfToJpegsIsolated,
  isPdf,
  isImage,
  withTimeout,
  PDFJS_STANDARD_FONT_DATA_PATH,
  PDFJS_STANDARD_FONT_DATA_URL,
};
