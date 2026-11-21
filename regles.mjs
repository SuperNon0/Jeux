import { randomInt } from 'node:crypto';

export const roles = Object.freeze({
  villageois: { nom: 'Villageois', camp: 'village' },
  cupidon: { nom: 'Cupidon', camp: 'village', nuit: true },
  voyante: { nom: 'Voyante', camp: 'village', nuit: true },
  salvateur: { nom: 'Salvateur', camp: 'village', nuit: true },
  loups: { nom: 'Loups-Garous', camp: 'loups', nuit: true, apres: ['salvateur'] },
  sorciere: { nom: 'Sorcière', camp: 'village', nuit: true, apres: ['loups'] },
  corbeau: { nom: 'Corbeau', camp: 'village', nuit: true },
  chasseur: { nom: 'Chasseur', camp: 'village', declencheur: 'elimination' },
  ancien: { nom: 'Ancien', camp: 'village' },
});

export const prenoms = Object.freeze({
  noe: 'Noë', julien: 'Julien', mael: 'Maël', marine: 'Marine', batiste: 'Batiste',
  melissa: 'Mélissa', gabi: 'Gabi', enzo: 'Enzo', clara: 'Clara',
});

export function annonceElimination(nom, role) {
  const prenom = Object.keys(prenoms).find(cle => prenoms[cle] === nom);
  const nomRole = role === 'loups' ? 'Loup-Garou' : roles[role].nom;
  const message = `${nom} a perdu la vie. Son rôle était ${nomRole}.`;
  return { fichier: `elimination-${prenom ?? 'role'}-${role}`, message,
    texte: prenom ? message : `Le rôle révélé était ${nomRole}.` };
}

export const ordreParDefaut = Object.freeze(['cupidon', 'voyante', 'salvateur', 'loups', 'sorciere', 'corbeau']);

export function ordreDeNuit(composition, ordre = ordreParDefaut.filter(role => composition[role] > 0)) {
  const attendus = Object.keys(roles).filter(role => roles[role].nuit && composition[role] > 0);
  if (ordre.length !== attendus.length || new Set(ordre).size !== ordre.length ||
      ordre.some(role => !attendus.includes(role))) {
    throw new Error('Chaque rôle nocturne actif doit apparaître exactement une fois.');
  }
  for (const [position, role] of ordre.entries()) {
    for (const precedent of roles[role].apres ?? []) {
      if (ordre.includes(precedent) && ordre.indexOf(precedent) >= position) {
        throw new Error(roles[precedent].nom + ' doit passer avant ' + roles[role].nom + '.');
      }
    }
  }
  return [...ordre];
}

export function candidatsEnTete(bulletins, maire = null, marqueCorbeau = null) {
  const compte = new Map();
  for (const [votant, cible] of bulletins) {
    if (cible == null) continue;
    compte.set(cible, (compte.get(cible) ?? 0) + (votant === maire ? 2 : 1));
  }
  if (marqueCorbeau !== null) compte.set(marqueCorbeau, (compte.get(marqueCorbeau) ?? 0) + 2);
  const maximum = Math.max(0, ...compte.values());
  return [...compte].filter(([, voix]) => voix === maximum).map(([cible]) => cible);
}

export function tirerAuSort(candidats) {
  if (candidats.length === 0) throw new Error('Aucun candidat au tirage.');
  return candidats[randomInt(candidats.length)];
}
