// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'corbeau',
  nom: 'Corbeau',
  camp: 'village',
  pouvoir: 'Chaque nuit, tu peux désigner une autre personne. Elle reçoit deux voix contre elle au premier tour du prochain vote d’élimination si elle survit à la nuit.',
  art: { image: 'roles-extension.png', taille: '200% 200%', position: 'left bottom' },
  nuit: { rang: 60, titre: 'Choisis qui marquer', icone: 'moon', bouton: 'Marquer', passer: 'Ne marquer personne' },
  phrases: {
    appel: 'Le Corbeau se réveille. Choisis la personne qui recevra deux voix contre elle au prochain vote d’élimination.',
    fin: 'Le Corbeau se rendort.',
    role: 'Son rôle était Corbeau.',
  },
};
