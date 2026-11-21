// Enfant sauvage : choisit un modèle la première nuit. Si ce modèle meurt, il rejoint la meute pour le reste de la partie.
// Chaque crochet reçoit `partie` (voir partie.mjs) : partie.vivants, partie.cartes, partie.nom(id),
// partie.annoncer(cle, message), partie.etatRole('enfant-sauvage') pour la mémoire du rôle, partie.jour pour le numéro de nuit.
export default {
  id: 'enfant-sauvage',
  nom: 'Enfant sauvage',
  camp: 'village',
  pouvoir: 'La première nuit, choisis un modèle parmi les autres joueurs. Tant qu’il vit, tu joues avec le village. S’il meurt, tu deviens Loup-Garou en secret.',
  explication: [
    'Première nuit : le narrateur t’appelle et tu choisis ton modèle sur ton téléphone. Tu ne peux pas te choisir toi-même. Ensuite, tu n’es plus appelé la nuit.',
    'Tant que ton modèle est en vie, tu es un simple membre du village : tu gagnes avec lui.',
    'Si ton modèle meurt, que ce soit la nuit, au vote ou par le tir du Chasseur, ta carte devient Loup-Garou. Personne n’est prévenu à voix haute.',
    'Dès la nuit suivante, tu te réveilles avec la meute, tu vois les autres loups et tu gagnes avec eux.',
    'Si tu meurs après ta transformation, le narrateur annonce Loup-Garou.',
  ],
  art: { image: 'roles/enfant-sauvage.png' },

  nuit: {
    rang: 12,
    premiereNuitSeulement: true,
    titre: 'Choisis ton modèle',
    consigne: 'Si cette personne meurt, tu deviendras Loup-Garou. Choisis bien.',
    icone: 'heart',
    bouton: 'Choisir ce modèle',
  },

  phrases: {
    appel: 'L’Enfant sauvage se réveille. Choisis ton modèle. Si cette personne meurt, tu deviendras Loup-Garou.',
    fin: 'L’Enfant sauvage se rendort.',
    role: 'Son rôle était Enfant sauvage.',
  },

  agir(partie, acteur, choix) {
    const etat = partie.etatRole('enfant-sauvage');
    etat.enfant = acteur;
    etat.modele = choix;
  },

  info(partie, joueur) {
    const { enfant, modele } = partie.etatRole('enfant-sauvage');
    if (enfant !== joueur || !modele) return '';
    return `Ton modèle : ${partie.nom(modele)}. S’il meurt, tu rejoins la meute.`;
  },

  surMort(partie, id) {
    const etat = partie.etatRole('enfant-sauvage');
    if (id !== etat.modele || !partie.vivants.has(etat.enfant) || partie.cartes.get(etat.enfant) !== 'enfant-sauvage') return;
    partie.cartes.set(etat.enfant, 'loups');
    etat.transforme = etat.enfant;
  },
};
