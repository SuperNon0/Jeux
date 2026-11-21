// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'sorciere',
  nom: 'Sorcière',
  camp: 'village',
  classique: true,
  pouvoir: 'Tu as une potion de soin et une de poison. Chacune ne s’utilise qu’une fois.',
  art: { image: 'sorciere-et-chasseur.png', taille: '200% 100%', position: 'left top' },
  nuit: { rang: 50, apres: ['loups'], titre: 'Choisis tes potions', consigne: 'Tu peux garder tes potions pour une autre nuit.', icone: 'sparkle' },
  phrases: {
    appel: 'La Sorcière se réveille. Tu peux utiliser tes potions ou les garder pour une autre nuit.',
    fin: 'La Sorcière se rendort.',
    role: 'Son rôle était Sorcière.',
  },
};
