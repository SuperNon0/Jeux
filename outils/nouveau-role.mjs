#!/usr/bin/env node
// Crée un nouveau rôle du Loup-Garou : son fichier, son inscription, ses phrases, son test et le prompt de son image.
//
//   npm run nouveau-role -- <id> "<Nom>" [--camp village|loups] [--nuit] [--rang 35] [--article Le|La|L’]
//                           [--image "description du personnage pour l’illustration"]
//
// Exemple : npm run nouveau-role -- renard "Renard" --nuit --rang 25 --image "un renard roux rusé…"
// Ensuite : coder le pouvoir dans le fichier créé, compléter le test, lancer `npm test`, pousser sur main.
// L’action GitHub « Voix du narrateur » crée les MP3, et l’image se range avec `npm run image-role`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const racine = new URL('../', import.meta.url);
const chemin = relatif => new URL(relatif, racine);

export const styleImage = 'Illustration carrée (1:1) d’une carte de rôle pour un jeu de Loup-Garou, dans le même style que les autres cartes : ' +
  'peinture numérique fantasy semi-réaliste et très détaillée, éclairage nocturne violet et lavande sous la pleine lune, ' +
  'touches de lumière chaude dorée (lanternes, bougies), village médiéval de Thiercelieux flou à l’arrière-plan, ' +
  'personnage cadré en buste ou à mi-corps et centré, fin liseré doré autour de l’image. Aucun texte, aucune lettre, aucun logo.';

export function promptImage(nom, description) {
  return `${styleImage}\n\nPersonnage : ${nom}. ${description || 'Décris ici son apparence, ses vêtements et un objet qui évoque son pouvoir.'}`;
}

export function modeleRole({ id, nom, camp, nuit, rang, article }) {
  const sujet = article === 'L’' ? `L’${nom}` : `${article} ${nom}`;
  const lignesNuit = nuit ? `
  // Phase de nuit : rang = place dans la nuit (Cupidon 10, Voyante 20, Salvateur 30, Loups 40, Sorcière 50, Corbeau 60).
  nuit: {
    rang: ${rang},
    titre: 'À compléter : titre de l’écran',
    consigne: 'À compléter : ce que la personne doit faire.',
    icone: 'moon',
    bouton: 'Valider',
    passer: 'Passer mon tour', // supprimer cette ligne si le rôle doit forcément choisir
  },
` : '';
  const phrasesNuit = nuit ? `
    appel: '${sujet} se réveille. À compléter.',
    fin: '${sujet} se rendort.',` : '';
  const crochetsNuit = nuit ? `
  // Personnes que le rôle peut choisir (par défaut : tous les vivants sauf lui).
  // cibles(partie, acteurs) { return [...partie.vivants].filter(id => !acteurs.includes(id)); },

  // Le rôle a-t-il encore son pouvoir ? Sinon il est appelé pour la forme, sans pouvoir agir.
  // actif(partie, acteurs) { return true; },

  // Choix validé (choix = id d’un joueur, ou null s’il passe). Garde ce qu’il faut dans partie.etatRole('${id}').
  agir(partie, acteur, choix) {
    partie.etatRole('${id}').cible = choix;
  },

  // Texte privé affiché au-dessus de la liste pendant son action.
  // vue(partie, joueur) { return ''; },
` : '';
  return `// ${nom} : décris ici son pouvoir en une phrase.
// Chaque crochet reçoit \`partie\` (voir partie.mjs) : partie.vivants, partie.cartes, partie.nom(id),
// partie.annoncer(cle, message), partie.etatRole('${id}') pour la mémoire du rôle, partie.jour pour le numéro de nuit.
export default {
  id: '${id}',
  nom: '${nom}',
  camp: '${camp}',
  pouvoir: 'À compléter : texte affiché sur la carte.',
  art: { image: 'roles/${id}.png' },
${lignesNuit}
  // Phrases du narrateur. appel → « ${id} », fin → « fin-${id} », role → « role-${id} »,
  // victoire → « victoire-${id} », autre clé → « ${id}-<clé> » (à passer à partie.annoncer).
  phrases: {${phrasesNuit}
    role: 'Son rôle était ${nom}.',
  },
${crochetsNuit}
  // Texte privé affiché sous la carte du joueur, toute la partie.
  // info(partie, joueur) { return ''; },

  // Juste avant « Le village se réveille » : appliquer les effets de la nuit.
  // auReveil(partie) {},

  // Les loups attaquent \`victime\` : renvoyer true pour annuler la mort.
  // surAttaque(partie, victime) { return false; },

  // Quelqu’un vient de mourir (cause : loups, poison, vote, chasseur, amour).
  // surMort(partie, id, cause) {},

  // Avant le décompte du vote d’élimination : renvoyer des voix en plus, par exemple { [idJoueur]: 1 }.
  // surVote(partie, bulletins) { return {}; },

  // Après chaque mort : renvoyer '${id}' (avec une phrase victoire) pour finir la partie, sinon null.
  // victoire(partie) { return null; },
};
`;
}

export function modeleTest({ id, nom, nuit }) {
  return `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { roles } from '../regles.mjs';

// Partie de test : ${nom} parmi quatre villageois et un loup, sans narration.
function partie() {
  const cartes = { Alice: 'villageois', Bastien: '${id}', Camille: 'villageois', Diane: 'loups', Élie: 'villageois' };
  const joueurs = Object.keys(cartes).map(id => ({ id, nom: id }));
  const composition = {};
  for (const role of Object.values(cartes)) composition[role] = (composition[role] ?? 0) + 1;
  const p = new Partie(joueurs, { ...verifierConfiguration(joueurs.length, composition), hote: 'Alice' });
  p.cartes = new Map(Object.entries(cartes));
  for (const { id } of joueurs) p.agir(id, p.vue(id).numero, null);
  p.agir('Alice', p.vue('Alice').numero, null);
  return p;
}

test('${nom} est inscrit dans le registre des rôles', () => {
  assert.equal(roles['${id}'].nom, '${nom}');
});
${nuit ? `
test('${nom} est appelé la nuit et son choix est gardé', () => {
  const p = partie();
  while (p.tour.type !== '${id}') p.agir('Diane', p.vue('Diane').numero, 'Alice');
  assert.ok(p.vue('Bastien').action.cibles.length);
  p.agir('Bastien', p.vue('Bastien').numero, 'Camille');
  assert.equal(p.etatRole('${id}').cible, 'Camille');
  assert.ok(p.annonces.some(a => a.fichier === 'fin-${id}'));
});
` : ''}
// À compléter : un test par effet du pouvoir (ce qui se passe à la mort, au vote, à la victoire…).
`;
}

function inscrire(id) {
  const fichier = chemin('public/loup-garou/roles/index.mjs');
  let texte = readFileSync(fichier, 'utf8');
  const variable = id.replace(/-([a-z])/g, (_, lettre) => lettre.toUpperCase());
  texte = texte.replace('// nouveaux-roles: imports', `import ${variable} from './${id}.mjs';\n// nouveaux-roles: imports`)
    .replace('  // nouveaux-roles: liste', `  ${variable},\n  // nouveaux-roles: liste`);
  writeFileSync(fichier, texte);
}

function lireOptions(args) {
  const [id, nom] = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.match(/^--(camp|rang|article|image)$/));
  const valeur = (nom, defaut) => { const i = args.indexOf(`--${nom}`); return i < 0 ? defaut : args[i + 1]; };
  return { id, nom, camp: valeur('camp', 'village'), nuit: args.includes('--nuit'), rang: Number(valeur('rang', 45)),
    article: valeur('article', 'Le'), image: valeur('image', '') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = lireOptions(process.argv.slice(2));
  const { id, nom } = options;
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(id ?? '') || !nom) {
    console.error('Usage : npm run nouveau-role -- <id-en-minuscules> "<Nom>" [--nuit] [--rang 35] [--camp village|loups] [--article La] [--image "…"]');
    process.exit(1);
  }
  if (!['village', 'loups'].includes(options.camp)) throw new Error('Le camp doit être village ou loups.');
  const fichierRole = chemin(`public/loup-garou/roles/${id}.mjs`);
  if (existsSync(fichierRole)) throw new Error(`Le rôle ${id} existe déjà.`);
  writeFileSync(fichierRole, modeleRole(options));
  inscrire(id);
  mkdirSync(chemin('tests/'), { recursive: true });
  writeFileSync(chemin(`tests/${id}.test.mjs`), modeleTest(options));
  mkdirSync(chemin('outils/prompts/'), { recursive: true });
  const prompt = promptImage(nom, options.image);
  writeFileSync(chemin(`outils/prompts/${id}.txt`), prompt + '\n');
  spawnSync(process.execPath, [new URL('./catalogue.mjs', import.meta.url).pathname], { stdio: 'inherit' });
  console.log(`
Rôle « ${nom} » créé :
  public/loup-garou/roles/${id}.mjs   ← pouvoir, textes et phrases à compléter
  tests/${id}.test.mjs                ← test à compléter
  outils/prompts/${id}.txt            ← prompt pour l’image

Après avoir complété les phrases : npm run catalogue, puis npm test.
Image : npm run image-role -- ${id} <fichier.png>

Prompt d’image pour ChatGPT :
${prompt}`);
}
