// Gardien (identifiant historique « salvateur », gardé pour les compositions enregistrées). Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'salvateur',
  nom: 'Gardien',
  camp: 'village',
  pouvoir: 'Protège une personne de l’attaque des loups, toi compris. D’une nuit à la suivante, choisis une personne différente ou passe ton tour.',
  art: { image: 'roles-extension.png', taille: '200% 200%', position: 'left top' },
  nuit: { rang: 30, titre: 'Choisis qui protéger', icone: 'shield', bouton: 'Protéger', passer: 'Passer cette nuit' },
  phrases: {
    appel: 'Le Gardien se réveille. Choisis la personne que tu veux protéger cette nuit.',
    fin: 'Le Gardien se rendort.',
    role: 'Son rôle était Gardien.',
  },
};
