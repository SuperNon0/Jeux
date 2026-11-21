// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'loups',
  nom: 'Loup-Garou',
  nomGroupe: 'Loups-Garous',
  camp: 'loups',
  multiple: true,
  pouvoir: 'Choisis une cible chaque nuit avec les membres de ta meute.',
  art: { image: 'cartes-et-ambiances.png', taille: '300% auto', position: 'left top' },
  nuit: { rang: 40, apres: ['salvateur'], titre: 'Choisissez votre cible', consigne: 'Mettez-vous d’accord : tu vois le choix des autres loups et tu peux changer le tien.', icone: 'moon', bouton: 'Confirmer la cible' },
  phrases: {
    appel: 'Les Loups-Garous se réveillent. Choisissez votre cible.',
    fin: 'Les Loups-Garous se rendorment.',
    role: 'Son rôle était Loup-Garou.',
  },
};
