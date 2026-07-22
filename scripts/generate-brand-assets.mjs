import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const logoDir = path.join(publicDir, "logo");
const sourceSvgPath = path.join(logoDir, "logo.svg");

const sourceSvg = await readFile(sourceSvgPath);

await mkdir(logoDir, { recursive: true });

const pngOutputs = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "android-chrome-192x192.png", size: 192 },
  { file: "android-chrome-512x512.png", size: 512 },
];

await writeFile(path.join(publicDir, "favicon.svg"), sourceSvg);

for (const output of pngOutputs) {
  await renderLogoPng(path.join(publicDir, output.file), output.size);
}

const icoBuffers = await Promise.all([16, 32, 48].map((size) => renderLogoPngBuffer(size)));
await writeFile(path.join(publicDir, "favicon.ico"), createIco(icoBuffers, [16, 32, 48]));

await writeFile(
  path.join(publicDir, "site.webmanifest"),
  `${JSON.stringify(
    {
      name: "Unvelar",
      short_name: "Unvelar",
      icons: [
        { src: "android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#dc2626",
      background_color: "#ffffff",
      display: "standalone",
      start_url: ".",
    },
    null,
    2,
  )}\n`,
);

await sharp(Buffer.from(createSocialPreviewSvg(sourceSvg)))
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(path.join(publicDir, "social-preview.png"));

console.log(
  [
    "Generated brand assets:",
    "public/favicon.svg",
    "public/favicon.ico",
    ...pngOutputs.map((output) => `public/${output.file}`),
    "public/site.webmanifest",
    "public/social-preview.png",
  ].join("\n"),
);

async function renderLogoPng(filePath, size) {
  await sharp(sourceSvg)
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(filePath);
}

async function renderLogoPngBuffer(size) {
  return sharp(sourceSvg)
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function createIco(pngBuffers, sizes) {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const entries = [];
  let imageOffset = headerSize + entrySize * pngBuffers.length;

  for (let index = 0; index < pngBuffers.length; index += 1) {
    const entry = Buffer.alloc(entrySize);
    const size = sizes[index];
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffers[index].length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    entries.push(entry);
    imageOffset += pngBuffers[index].length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

function createSocialPreviewSvg(logoSvg) {
  const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fafaf9"/>
  <rect x="64" y="64" width="1072" height="502" rx="40" fill="#ffffff"/>
  <image href="${logoDataUri}" x="132" y="165" width="300" height="300"/>
  <text x="492" y="272" fill="#1c1917" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="82" font-weight="800">Unvelar</text>
  <text x="496" y="345" fill="#44403c" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="29" font-weight="600">Visual IP Monitoring &amp; Takedowns</text>
  <text x="496" y="409" fill="#78716c" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="25" font-weight="500">Scan the web. Turn every hit into a takedown-ready case.</text>
</svg>`;
}
