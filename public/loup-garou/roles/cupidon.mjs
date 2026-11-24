// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'cupidon',
  nom: 'Cupidon',
  camp: 'village',
  pouvoir: 'La première nuit, lie deux personnes, toi compris si tu le veux. Si l’une meurt, l’autre meurt de chagrin. Un couple formé d’un loup et d’un membre du village gagne s’il reste seul en vie.',
  art: { image: 'roles-extension.png', taille: '200% 200%', position: 'right bottom' },
  nuit: { rang: 10, premiereNuitSeulement: true, titre: 'Forme un couple', icone: 'heart' },
  // Cupidon retrouve sous sa carte le couple qu’il a formé.
  info(partie) {
    const [premier, second] = partie.couple ?? [];
    return premier ? `Tu as lié ${partie.nom(premier)} et ${partie.nom(second)}.` : '';
  },
  phrases: {
    appel: 'Cupidon se réveille. Choisis deux personnes qui seront liées pour toute la partie.',
    fin: 'Cupidon se rendort.',
    role: 'Son rôle était Cupidon.',
  },
};
