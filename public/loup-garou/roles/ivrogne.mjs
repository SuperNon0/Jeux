// Ivrogne : chaque nuit, il va finir la soirée chez quelqu’un. Absent de chez lui, il échappe aux loups,
// mais si les loups dévorent son hôte, il meurt avec lui.
// Chaque crochet reçoit `partie` (voir partie.mjs) : partie.vivants, partie.cartes, partie.nom(id),
// partie.etatRole('ivrogne') pour la mémoire du rôle.
const etatIvrogne = partie => partie.etatRole('ivrogne');

export default {
  id: 'ivrogne',
  nom: 'Ivrogne',
  camp: 'village',
  pouvoir: 'Chaque nuit, tu peux aller finir la soirée chez quelqu’un et tu découvres son rôle. Si les loups t’attaquent chez toi, tu n’y es pas. Si les loups dévorent ton hôte, tu meurs avec lui.',
  explication: [
    'Chaque nuit, avant les loups, le narrateur t’appelle et tu choisis chez qui tu vas boire un dernier verre. Tu peux aussi rester chez toi.',
    'Tu ne peux pas retourner chez la même personne deux nuits de suite.',
    'Si les loups t’attaquent alors que tu dors ailleurs, ils trouvent ta maison vide : tu survis et personne ne meurt de leur attaque.',
    'Si les loups dévorent la personne chez qui tu dors, tu meurs avec elle. Si le Gardien ou la Sorcière la sauve, tu es sauvé aussi.',
    'Au réveil, tu découvres le rôle de la personne chez qui tu as dormi. Il reste noté sous ta carte pour toute la partie.',
    'Si tu restes chez toi, tu ne découvres rien et tu es un simple membre du village pour la nuit. Tu gagnes avec le village.',
  ],
  art: { image: 'roles/ivrogne.png' },

  nuit: {
    rang: 35,
    titre: 'Choisis où finir la nuit',
    consigne: 'Tu dors chez cette personne cette nuit. Tu ne peux pas y retourner la nuit suivante.',
    icone: 'home',
    bouton: 'Aller chez cette personne',
    passer: 'Rester chez moi',
  },

  phrases: {
    appel: 'L’Ivrogne se réveille. Choisis chez qui tu vas finir la nuit.',
    fin: 'L’Ivrogne se rendort.',
    role: 'Son rôle était Ivrogne.',
  },

  cibles(partie, acteurs) {
    const { precedent } = etatIvrogne(partie);
    return [...partie.vivants].filter(id => !acteurs.includes(id) && id !== precedent);
  },

  agir(partie, acteur, choix) {
    const etat = etatIvrogne(partie);
    etat.ivrogne = acteur;
    etat.hote = choix;
  },

  info(partie, joueur) {
    const { ivrogne, precedent, decouvertes = [] } = etatIvrogne(partie);
    if (ivrogne !== joueur) return '';
    const vus = decouvertes.map(({ nuit, nom, role }) => `nuit ${nuit}, ${nom} : ${role}`).join(' · ');
    return [vus && `Tes hôtes : ${vus}.`, precedent && `Impossible de retourner chez ${partie.nom(precedent)} ce soir.`]
      .filter(Boolean).join(' ');
  },

  // Les loups visent l’Ivrogne pendant qu’il dort ailleurs : la maison est vide.
  surAttaque(partie, victime) {
    const { ivrogne, hote } = etatIvrogne(partie);
    return victime === ivrogne && Boolean(hote);
  },

  // Les loups ont dévoré son hôte (sans protection ni soin) : l’Ivrogne meurt avec lui.
  auReveil(partie) {
    const etat = etatIvrogne(partie);
    if (etat.hote && etat.hote === partie.victimeLoups && partie.vivants.has(etat.ivrogne)) {
      partie.ajouterVictimeNuit(etat.ivrogne, 'loups');
    }
    // Au réveil, il se souvient de la carte de son hôte, même si les loups les emportent.
    if (etat.hote) {
      etat.decouvertes = [...(etat.decouvertes ?? []),
        { nuit: partie.jour, nom: partie.nom(etat.hote), role: partie.nomRole(partie.cartes.get(etat.hote)) }];
    }
    etat.precedent = etat.hote ?? null;
    etat.hote = null;
  },
};
