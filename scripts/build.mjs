import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'favicon.svg', 'src']) await cp(file, `dist/${file}`, { recursive: true });
console.log('Built static app in dist/');
