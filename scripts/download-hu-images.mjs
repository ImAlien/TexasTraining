// Explicit local-study download requested by the user. Original bytes are preserved.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const article = 'https://blog.gtowizard.com/isolating_limpers_in_short_stack_hu/';
const folder = resolve(import.meta.dirname, '../src/data/gtowizard-hu-images');
const response = await fetch(article, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Article HTTP ${response.status}`);
const html = await response.text();
const urls = [...new Set([...html.matchAll(/https:\/\/blog\.gtowizard\.com\/content\/wp-content\/uploads\/2025\/09\/[^\s"<>]+?\.png/g)].map(m => m[0]))];
if (!urls.length || urls.length > 100) throw new Error('Unexpected article image list');
await mkdir(folder, { recursive: true });
const records = new Array(urls.length);
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < urls.length) {
    const index = cursor++, sourceUrl = urls[index];
    const file = new URL(sourceUrl).pathname.split('/').pop();
    if (!/^[a-z0-9-]+\.png$/i.test(file)) throw new Error('Unexpected image filename');
    let bytes;
    try { bytes = await readFile(resolve(folder, file)); } catch {}
    if (!bytes) {
      const image = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
      if (!image.ok || !image.headers.get('content-type')?.startsWith('image/')) throw new Error(`${file}: HTTP ${image.status}`);
      bytes = Buffer.from(await image.arrayBuffer());
    }
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`${file}: not a PNG`);
    await writeFile(resolve(folder, file), bytes);
    records[index] = { file, src: `/src/data/gtowizard-hu-images/${file}`, sourceUrl,
      width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}));
console.log(JSON.stringify({ article, retrievedAt: '2026-11-23', rights: 'GTO Wizard; locally cached for user study. No open redistribution license asserted.', images: records }));
