/** Deterministic derivatives of the supplied official artwork; never redraws the logo. */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.JURIS_BRAND_SHARP_MODULE || 'sharp');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(project, 'public/brand/logo-principal-horizontal.png'));
const background = '#111617';
await sharp(source).resize(670, 200).flatten({ background }).png({ compressionLevel: 9 }).toFile(resolve(project, 'public/brand/logo-email.png'));
const logo = await sharp(source).resize(940, 281, { fit: 'contain' }).png().toBuffer();
const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><text x="600" y="477" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" fill="#E4DED0">Conexiones legales claras para Chile.</text><text x="600" y="555" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="#D8BD83">jurisconecta.cl</text><path d="M130 590H1070" stroke="#D8BD83" stroke-opacity=".4"/></svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 4, background } }).composite([{ input: logo, top: 100, left: 130 }, { input: caption }]).png({ compressionLevel: 9 }).toFile(resolve(project, 'public/og-jurisconecta.png'));
console.log('Built official email logo (670×200) and social card (1200×630).');
