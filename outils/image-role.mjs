#!/usr/bin/env node
// Range l’illustration d’un rôle : recadrage carré au centre, 768 px, PNG dans public/illustrations/roles/.
//   npm run image-role -- <id> <image.png|jpg|webp>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const [id, source] = process.argv.slice(2);
if (!/^[a-z]+(?:-[a-z]+)*$/.test(id ?? '') || !source || !existsSync(source)) {
  console.error('Usage : npm run image-role -- <id> <image>');
  process.exit(1);
}
const dossier = new URL('../public/illustrations/roles/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });
const sortie = `${dossier}${id}.png`;
const resultat = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf',
  'crop=min(iw\\,ih):min(iw\\,ih),scale=768:768:flags=lanczos', '-frames:v', '1', '-compression_level', '9', sortie], { stdio: 'inherit' });
if (resultat.status !== 0) process.exit(resultat.status ?? 1);
console.log(`Image rangée dans public/illustrations/roles/${id}.png`);
