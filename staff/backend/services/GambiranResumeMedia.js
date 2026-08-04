const path = require('path');
const { pathToFileURL } = require('url');
const sharp = require('sharp');
const { createCanvas } = require('canvas');

const DEFAULT_PDF_RENDER_TIMEOUT_MS = 30000;
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_STANDARD_FONT_DATA_PATH = `${path.join(PDFJS_ROOT, 'standard_fonts')}${path.sep}`;
const PDFJS_STANDARD_FONT_DATA_URL = pathToFileURL(PDFJS_STANDARD_FONT_DATA_PATH).href;

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

async function pdfToJpegs(buffer) {
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
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
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
      pages.push({ page: pageNumber, buffer: await imageToJpeg(canvas.toBuffer('image/png')) });
      page.cleanup();
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

async function convertToJpegs(buffer, mimeType, filename) {
  if (isPdf(buffer, mimeType, filename)) return pdfToJpegs(buffer);
  if (isImage(mimeType, filename)) return [{ page: 1, buffer: await imageToJpeg(buffer) }];
  return [];
}

module.exports = {
  convertToJpegs,
  imageToJpeg,
  pdfToJpegs,
  isPdf,
  isImage,
  withTimeout,
  PDFJS_STANDARD_FONT_DATA_PATH,
  PDFJS_STANDARD_FONT_DATA_URL,
};
