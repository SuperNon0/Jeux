import { randomInt } from 'node:crypto';

import { roles } from './public/loup-garou/roles/index.mjs';

export { roles };
export const votePasse = 'passer';

export const prenoms = Object.freeze({
  noe: 'Noë', julien: 'Julien', mael: 'Maël', marine: 'Marine', batiste: 'Batiste',
  melissa: 'Mélissa', gabi: 'Gabi', enzo: 'Enzo', clara: 'Clara',
});

// Une mort s’annonce en deux pistes : « Noë a perdu la vie. » puis « Son rôle était Corbeau. ».
// Le texte complet accompagne la piste du rôle. Un prénom sans piste (bot, invité) n’a que celle-ci.
export function annonceElimination(nom, role) {
  const prenom = Object.keys(prenoms).find(cle => prenoms[cle] === nom);
  const message = `${nom} a perdu la vie. Son rôle était ${roles[role].nom}.`;
  return prenom
    ? [{ fichier: `deces-${prenom}` }, { fichier: `role-${role}`, message }]
    : [{ fichier: `role-${role}`, message }];
}

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
