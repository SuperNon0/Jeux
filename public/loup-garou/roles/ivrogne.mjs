// L’Ivrogne échappe à l’attaque de la meute quand il dort ailleurs. Il meurt s’il dort chez un loup
// ou si la meute dévore son hôte.
// Chaque crochet reçoit `partie` (voir partie.mjs) : partie.vivants, partie.cartes, partie.nom(id),
// partie.etatRole('ivrogne') pour la mémoire du rôle.
const etatIvrogne = partie => partie.etatRole('ivrogne');

export default {
  id: 'ivrogne',
  nom: 'Ivrogne',
  camp: 'village',
  pouvoir: 'Chaque nuit, tu peux dormir chez quelqu’un et découvrir son rôle. Ta maison vide te protège de l’attaque des loups. Tu meurs si tu dors chez un Loup-Garou ou si la meute dévore ton hôte.',
  explication: [
    'Chaque nuit, avant les loups, le narrateur t’appelle et tu choisis chez qui tu vas boire un dernier verre. Tu peux aussi rester chez toi.',
    'Tu ne peux pas retourner chez la même personne deux nuits de suite.',
    'Si la meute vise ta maison pendant que tu dors ailleurs, elle la trouve vide. Son attaque ne fait alors aucune victime.',
    'Si tu choisis un Loup-Garou comme hôte, tu meurs au réveil, quelle que soit la cible de la meute.',
    'Si les loups dévorent la personne chez qui tu dors, tu meurs avec elle. Si le Gardien ou la Sorcière la sauve, tu es sauvé aussi.',
    'Au réveil, le rôle de ton hôte apparaît sur ton écran de partie. Tu peux le retrouver sous ta carte.',
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

  revelationPrivee(partie, joueur) {
    const { ivrogne, decouvertes } = etatIvrogne(partie);
    const derniere = decouvertes?.at(-1);
    if (ivrogne === joueur && derniere?.nuit === partie.jour) return derniere;
  },

  // Les loups visent l’Ivrogne pendant qu’il dort ailleurs : la maison est vide.
  surAttaque(partie, victime) {
    const { ivrogne, hote } = etatIvrogne(partie);
    return victime === ivrogne && Boolean(hote);
  },

  auReveil(partie) {
    const etat = etatIvrogne(partie);
    const roleHote = partie.cartes.get(etat.hote);
    if (etat.hote && (roleHote === 'loups' || etat.hote === partie.victimeLoups)) {
      partie.ajouterVictimeNuit(etat.ivrogne, 'loups');
    }
    // Au réveil, il se souvient de la carte de son hôte, même si les loups les emportent.
    if (etat.hote) {
      etat.decouvertes = [...(etat.decouvertes ?? []),
        { nuit: partie.jour, nom: partie.nom(etat.hote), role: partie.nomRole(roleHote) }];
    }
    etat.precedent = etat.hote ?? null;
    etat.hote = null;
  },
};
