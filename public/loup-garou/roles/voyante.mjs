// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'voyante',
  nom: 'Voyante',
  camp: 'village',
  classique: true,
  pouvoir: 'Découvre le rôle d’une personne chaque nuit. Tes révélations restent dans ton journal privé.',
  art: { image: 'cartes-et-ambiances.png', taille: '300% auto', position: 'right top' },
  nuit: { rang: 20, titre: 'Découvre un rôle', consigne: 'Touche un joueur pour révéler sa carte. Tu pourras la revoir dans ton journal privé.', icone: 'eye' },
  phrases: {
    appel: 'La Voyante se réveille. Choisis la personne dont tu veux découvrir le rôle.',
    fin: 'La Voyante se rendort.',
    role: 'Son rôle était Voyante.',
  },
};
