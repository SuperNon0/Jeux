// Petite Fille : jamais appelée, elle peut espionner la meute pendant le tour des loups, au risque d’être repérée.
// Chaque crochet reçoit `partie` (voir partie.mjs) ; partie.etatRole('petite-fille') garde ses découvertes.
import { randomInt } from './hasard.mjs';

export const chanceDEtreVue = 3; // une fois sur trois

const lettre = nom => nom.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();

export default {
  id: 'petite-fille',
  nom: 'Petite Fille',
  camp: 'village',
  pouvoir: 'Pendant le tour des loups, tu peux les espionner : tu vois leur cible et l’initiale de l’un d’eux. Mais une fois sur trois, ils te repèrent.',
  explication: [
    'Le narrateur ne t’appelle jamais : personne ne sait qui tu es.',
    'Pendant le tour des Loups-Garous, ton téléphone affiche le bouton « Espionner les loups ». Tu peux l’utiliser une fois par nuit, ou ne rien faire.',
    'Si tu espionnes, tu vois la personne que les loups visent à ce moment-là et la première lettre du prénom d’un des loups, tiré au hasard.',
    'Attention : une fois sur trois, les loups te repèrent. Leur téléphone affiche alors ton prénom, et ils peuvent changer de cible pour t’attaquer.',
    'Tes découvertes restent notées sous ta carte. Tu gagnes avec le village.',
  ],
  art: { image: 'roles/petite-fille.png' },

  // Action possible pendant la phase d’un autre rôle, sans être appelée.
  espion: { phase: 'loups', bouton: 'Espionner les loups' },

  phrases: {
    role: 'Son rôle était Petite Fille.',
  },

  peutEspionner(partie, joueur) {
    const { nuits = [] } = partie.etatRole('petite-fille');
    return !nuits.includes(partie.jour) && partie.vivants.has(joueur);
  },

  espionner(partie, joueur) {
    const etat = partie.etatRole('petite-fille');
    etat.nuits = [...(etat.nuits ?? []), partie.jour];
    const { acteurs, reponses } = partie.tour;
    const loup = acteurs[randomInt(acteurs.length)];
    const choix = [...reponses.values()].filter(Boolean);
    const cible = choix.length ? partie.nom(choix.sort((a, b) => choix.filter(x => x === b).length - choix.filter(x => x === a).length)[0]) : null;
    const decouverte = { nuit: partie.jour, cible, initiale: lettre(partie.nom(loup)) };
    etat.decouvertes = [...(etat.decouvertes ?? []), decouverte];
    if (randomInt(chanceDEtreVue) === 0) etat.reperee = { nuit: partie.jour, joueur };
    return decouverte;
  },

  info(partie, joueur) {
    const { decouvertes = [] } = partie.etatRole('petite-fille');
    return decouvertes.map(({ nuit, cible, initiale }) =>
      `Nuit ${nuit} : ${cible ? `les loups visaient ${cible}` : 'les loups n’avaient pas encore choisi'}, un loup commence par ${initiale}.`).join(' ');
  },
};
