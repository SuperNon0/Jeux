// Petite Fille : rôle joué autour de la table. Le site ne l’appelle jamais et ne lui demande rien :
// elle a le droit d’entrouvrir les yeux pendant la nuit, à ses risques.
export default {
  id: 'petite-fille',
  nom: 'Petite Fille',
  camp: 'village',
  pouvoir: 'Pendant la nuit, tu as le droit d’entrouvrir les yeux pour espionner, surtout quand le narrateur appelle les Loups-Garous. Mais si un loup te surprend, tu deviens sa cible idéale.',
  explication: [
    'Le narrateur ne t’appelle jamais et ton téléphone ne te demande rien : personne ne sait qui tu es.',
    'Pendant la nuit, tu peux entrouvrir les yeux discrètement quand le narrateur appelle un rôle, par exemple « Les Loups-Garous se réveillent », pour voir qui bouge ou regarde son téléphone.',
    'Reste discrète : garde la tête baissée et ne fixe personne. Les loups ont les yeux ouverts pendant leur tour et peuvent te surprendre.',
    'Si un loup te voit espionner, rien ne l’oblige à le dire, mais il saura qui t’attaquer.',
    'Au jour, sers-toi de ce que tu as vu sans te dévoiler trop vite. Tu gagnes avec le village.',
  ],
  art: { image: 'roles/petite-fille.png' },

  phrases: {
    role: 'Son rôle était Petite Fille.',
  },
};
