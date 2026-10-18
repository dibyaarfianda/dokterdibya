// Preview needs the central directory (names and sizes), never the image bodies.
// Keep decoding consistent with adm-zip on the server (UTF-8 entry names).
export async function readZipDirectory(file) {
    function unsupported() {
        const error = new Error('Format direktori ZIP memerlukan pembacaan di server');
        error.code = 'ZIP_DIRECTORY_UNSUPPORTED';
        return error;
    }
    if (!file || file.size < 22) throw new Error('File ZIP tidak valid');
    const tailStart = Math.max(0, file.size - 65557);
    const tail = new DataView(await file.slice(tailStart, file.size).arrayBuffer());
    let end = -1;
    for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
        if (tail.getUint32(offset, true) === 0x06054b50
            && offset + 22 + tail.getUint16(offset + 20, true) === tail.byteLength) {
            end = offset;
            break;
        }
    }
    if (end < 0) throw new Error('Direktori file ZIP tidak ditemukan');
    const count = tail.getUint16(end + 10, true);
    const size = tail.getUint32(end + 12, true);
    const start = tail.getUint32(end + 16, true);
    if (tail.getUint16(end + 4, true) || tail.getUint16(end + 6, true)
        || tail.getUint16(end + 8, true) !== count || count === 0xffff
        || size === 0xffffffff || start === 0xffffffff || size > 8 * 1024 * 1024
        || start + size > tailStart + end) throw unsupported();

    const buffer = await file.slice(start, start + size).arrayBuffer();
    const directory = new DataView(buffer);
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    const entries = [];
    let offset = 0;
    for (let index = 0; index < count; index += 1) {
        if (offset + 46 > directory.byteLength || directory.getUint32(offset, true) !== 0x02014b50) {
            throw unsupported();
        }
        const nameLength = directory.getUint16(offset + 28, true);
        const extraLength = directory.getUint16(offset + 30, true);
        const commentLength = directory.getUint16(offset + 32, true);
        const next = offset + 46 + nameLength + extraLength + commentLength;
        const entrySize = directory.getUint32(offset + 24, true);
        if (next > directory.byteLength || entrySize === 0xffffffff) throw unsupported();
        const entryName = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
        entries.push({ entryName, isDirectory: /[\\/]$/.test(entryName), size: entrySize });
        offset = next;
    }
    if (offset !== directory.byteLength) throw unsupported();
    return entries;
}
