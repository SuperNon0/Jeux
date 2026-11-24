import { randomInt } from 'node:crypto';

import { roles } from './public/loup-garou/roles/index.mjs';

export { roles };
export const votePasse = 'passer';

export const prenoms = Object.freeze({
  noe: 'Noë', julien: 'Julien', mael: 'Maël', marine: 'Marine', batiste: 'Batiste',
  melissa: 'Mélissa', gabi: 'Gabi', enzo: 'Enzo', clara: 'Clara',
});

// Clé de piste d’un prénom connu (« noe » pour Noë), ou undefined pour un bot ou un invité.
export const clePrenom = nom => Object.keys(prenoms).find(cle => prenoms[cle] === nom);

// Phrases dites avec le prénom du joueur : une piste par prénom connu (« maire-elu-noe.mp3 »).
// Un bot ou un prénom sans piste entend la phrase générale du catalogue (« maire-elu.mp3 »).
export const phrasesAvecPrenom = Object.freeze({
  'maire-elu': p => `Le village a choisi son maire : c’est ${p}.`,
  'nouveau-maire': p => `${p} reprend l’écharpe de maire.`,
  'succession-maire': p => `${p} était maire. Avant de partir, désigne qui prendra ta place.`,
  'departage-maire': p => `Égalité ! C’est à ${p}, notre maire, de trancher.`,
  'resultat-vote': p => `Le village a tranché : ${p} quitte la partie.`,
  'marque-corbeau': p => `Le Corbeau a marqué la maison de ${p}. Deux voix pèseront contre ${p} au prochain vote.`,
  'mort-amoureux': p => `Fou de chagrin, ${p} rejoint son amour dans la mort.`,
  chasseur: p => `${p} était le Chasseur. Dans un dernier souffle, choisis qui tu emportes avec toi.`,
  'tir-chasseur': p => `Un coup de fusil retentit. Le Chasseur emporte ${p} avec lui.`,
});

// Piste et texte d’une phrase avec prénom : { fichier, message }.
export function phraseAvecPrenom(base, nom) {
  const cle = clePrenom(nom);
  return { fichier: cle ? `${base}-${cle}` : base, message: phrasesAvecPrenom[base](nom) };
}

// Une mort s’annonce en deux pistes : « Noë a perdu la vie. » puis « Son rôle était Corbeau. ».
// Le texte complet accompagne la piste du rôle. Un prénom sans piste (bot, invité) n’a que celle-ci.
// `avecDeces: false` saute la première piste quand la phrase précédente a déjà dit le prénom (vote, chagrin, tir).
export function annonceElimination(nom, role, avecDeces = true) {
  const prenom = clePrenom(nom);
  const message = `${nom} a perdu la vie. Son rôle était ${roles[role].nom}.`;
  return prenom && avecDeces
    ? [{ fichier: `deces-${prenom}` }, { fichier: `role-${role}`, message }]
    : [{ fichier: `role-${role}`, message }];
}

// Causes de mort affichées dans le journal quand l’hôte le permet.
export const causesDeMort = Object.freeze({
  loups: 'attaque des loups', poison: 'poison de la Sorcière', vote: 'vote du village',
  chasseur: 'tir du Chasseur', amour: 'chagrin d’amour',
});

// Passage du vote d’élimination : qui décide, et pour quels votes.
export const modesPassage = Object.freeze({
  non: 'Désactivé', majorite: 'À la majorité', unanimite: 'À l’unanimité', maire: 'Décision du maire',
});
export const porteesPassage = Object.freeze({ premier: 'Premier vote seulement', tous: 'Tous les votes' });

export const ordreParDefaut = Object.freeze(Object.keys(roles).filter(role => roles[role].nuit)
  .sort((a, b) => roles[a].nuit.rang - roles[b].nuit.rang));

export function ordreDeNuit(composition, ordre = ordreParDefaut.filter(role => composition[role] > 0)) {
  const attendus = Object.keys(roles).filter(role => roles[role].nuit && composition[role] > 0);
  if (ordre.length !== attendus.length || new Set(ordre).size !== ordre.length ||
      ordre.some(role => !attendus.includes(role))) {
    throw new Error('Chaque rôle nocturne actif doit apparaître exactement une fois.');
  }
  for (const [position, role] of ordre.entries()) {
    for (const precedent of roles[role].nuit.apres ?? []) {
      if (ordre.includes(precedent) && ordre.indexOf(precedent) >= position) {
        throw new Error(nomGroupe(precedent) + ' doit passer avant ' + nomGroupe(role) + '.');
      }
    }
  }
  return [...ordre];
}

const nomGroupe = role => roles[role].nomGroupe ?? roles[role].nom;

// `bonus` ajoute des voix (Corbeau, nouveaux rôles) : { idJoueur: voix }.
export function candidatsEnTete(bulletins, maire = null, marqueCorbeau = null, bonus = {}) {
  const compte = new Map();
  for (const [votant, cible] of bulletins) {
    if (cible == null) continue;
    compte.set(cible, (compte.get(cible) ?? 0) + (votant === maire ? 2 : 1));
  }
  if (marqueCorbeau !== null) compte.set(marqueCorbeau, (compte.get(marqueCorbeau) ?? 0) + 2);
  for (const [cible, voix] of Object.entries(bonus)) if (voix) compte.set(cible, (compte.get(cible) ?? 0) + voix);
  const maximum = Math.max(0, ...compte.values());
  return [...compte].filter(([, voix]) => voix === maximum).map(([cible]) => cible);
}

export function tirerAuSort(candidats) {
  if (candidats.length === 0) throw new Error('Aucun candidat au tirage.');
  return candidats[randomInt(candidats.length)];
}
