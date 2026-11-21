#!/usr/bin/env node
// Génère les annonces manquantes avec la voix du narrateur (Piper, voix française « Tom »).
// Usage : node outils/voix.mjs [catalogue.json] [dossier-audio] [--forcer cle1,cle2] [--essai "phrase" fichier.mp3]
// Variables : VOIX_MODELE (chemin du modèle .onnx), PIPER (commande Piper, par défaut « python3 -m piper »).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const reglagesVoix = Object.freeze({
  modele: 'fr_FR-tom-medium',
  silencePhrase: 0.35,
  // Même rendu que les pistes d’origine : -19 LUFS, crête à -2 dBTP, MP3 mono 44,1 kHz à 128 kbit/s.
  filtre: 'adelay=120,apad=pad_dur=0.25,loudnorm=I=-19:TP=-2:LRA=7,aresample=44100',
});

function executer(commande, args, entree) {
  const resultat = spawnSync(commande, args, { input: entree, encoding: 'utf8' });
  if (resultat.status !== 0) throw new Error(`${commande} ${args.join(' ')}\n${resultat.stderr || resultat.error}`);
}

export function genererPhrase(texte, sortie, modele = process.env.VOIX_MODELE ?? `outils/voix/${reglagesVoix.modele}.onnx`) {
  if (!existsSync(modele)) throw new Error(`Modèle de voix introuvable : ${modele}. Lance d’abord : python3 -m piper.download_voices ${reglagesVoix.modele} --download-dir outils/voix`);
  const [commande, ...prefixe] = (process.env.PIPER ?? 'python3 -m piper').split(' ');
  const dossier = mkdtempSync(join(tmpdir(), 'voix-'));
  try {
    const wav = join(dossier, 'phrase.wav');
    executer(commande, [...prefixe, '-m', modele, '-f', wav, '--sentence-silence', String(reglagesVoix.silencePhrase)], texte);
    executer('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', reglagesVoix.filtre, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', sortie]);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

export function phrasesManquantes(catalogue, dossier, forcer = []) {
  return Object.entries(catalogue).filter(([cle]) => forcer.includes(cle) || !existsSync(join(dossier, `${cle}.mp3`)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(nom); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const essai = args.indexOf('--essai');
  if (essai >= 0) {
    const [, texte, sortie] = args.splice(essai, 3);
    genererPhrase(texte, sortie);
    console.log(`Essai écrit dans ${sortie}`);
    process.exit(0);
  }
  const forcer = option('--forcer')?.split(',') ?? [];
  const [catalogueChemin = 'public/annonces.json', dossier = 'public/audio'] = args;
  const catalogue = JSON.parse(readFileSync(catalogueChemin, 'utf8'));
  const aFaire = phrasesManquantes(catalogue, dossier, forcer);
  for (const [cle, texte] of aFaire) {
    genererPhrase(texte, resolve(dossier, `${cle}.mp3`));
    console.log(`✓ ${cle}.mp3 · ${texte}`);
  }
  console.log(aFaire.length ? `${aFaire.length} annonce(s) générée(s).` : 'Toutes les annonces ont déjà leur MP3.');
}
