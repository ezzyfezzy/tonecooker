// One-off icon rasterizer. Run after editing assets/icon*-source.svg:
//   npm install --no-save sharp && node scripts/gen-icons.mjs && npm uninstall sharp
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const assets = new URL('../assets/', import.meta.url);
const pub = new URL('../public/', import.meta.url);

const jobs = [
  ['icon-source.svg', assets, 'pwa-192x192.png', pub, 192],
  ['icon-source.svg', assets, 'pwa-512x512.png', pub, 512],
  ['icon-source.svg', assets, 'apple-touch-icon.png', pub, 180],
  ['icon-maskable-source.svg', assets, 'maskable-icon-512x512.png', pub, 512],
];

for (const [src, srcBase, out, outBase, size] of jobs) {
  await sharp(fileURLToPath(new URL(src, srcBase)))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(out, outBase)));
  console.log('wrote', out);
}
