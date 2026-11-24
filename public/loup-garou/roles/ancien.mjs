// Rôle d’origine : son pouvoir est codé dans partie.mjs. Ce fichier décrit le reste.
export default {
  id: 'ancien',
  nom: 'Ancien',
  camp: 'village',
  pouvoir: 'Tu survis à la première attaque des loups qui te touche. Le poison et le vote peuvent t’éliminer dès la première fois.',
  art: { image: 'roles-extension.png', taille: '200% 200%', position: 'right top' },
  // L’attaque survécue n’est plus annoncée à voix haute : seul l’Ancien l’apprend sur son téléphone.
  info(partie) {
    return partie.ancienTouche ? 'Les loups t’ont déjà attaqué une fois et tu as survécu. La prochaine morsure sera fatale.' : '';
  },
  phrases: {
    role: 'Son rôle était Ancien.',
  },
};
