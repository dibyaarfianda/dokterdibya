const { once } = require('events');
const { pdfToJpegsInProcess } = require('./GambiranResumeMedia');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function writePage(item) {
  const line = `JPG\t${JSON.stringify({ page: item.page, jpeg: item.buffer.toString('base64') })}\n`;
  if (!process.stdout.write(line)) await once(process.stdout, 'drain');
}

async function main() {
  if (process.env.GAMBIRAN_RESUME_PDF_WORKER !== '1') {
    throw new Error('Worker PDF hanya boleh dijalankan oleh service resume');
  }
  const buffer = await readStdin();
  if (!buffer.length) throw new Error('PDF worker menerima input kosong');
  await pdfToJpegsInProcess(buffer, { onPage: writePage });
}

main().then(() => process.exit(0)).catch(error => {
  process.stderr.write(`${String(error?.message || error).slice(0, 1000)}\n`);
  process.exit(1);
});
