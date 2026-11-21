// Registre des rôles du Loup-Garou, partagé par le serveur et les téléphones.
// Le script `npm run nouveau-role` ajoute ici les nouveaux rôles : garde une ligne par rôle.
import villageois from './villageois.mjs';
import loups from './loups.mjs';
import voyante from './voyante.mjs';
import sorciere from './sorciere.mjs';
import chasseur from './chasseur.mjs';
import cupidon from './cupidon.mjs';
import salvateur from './salvateur.mjs';
import ancien from './ancien.mjs';
import corbeau from './corbeau.mjs';
import enfantSauvage from './enfant-sauvage.mjs';
import ivrogne from './ivrogne.mjs';
// nouveaux-roles: imports

export const listeRoles = Object.freeze([
  villageois, loups, voyante, sorciere, chasseur, cupidon, salvateur, ancien, corbeau,
  enfantSauvage,
  ivrogne,
  // nouveaux-roles: liste
]);

export const roles = Object.freeze(Object.fromEntries(listeRoles.map(role => [role.id, role])));

export const nomsCamps = Object.freeze({ village: 'Village', loups: 'Meute' });

// Rôles dont le pouvoir est codé directement dans partie.mjs.
export const rolesHistoriques = Object.freeze(['villageois', 'loups', 'voyante', 'sorciere', 'chasseur', 'cupidon', 'salvateur', 'ancien', 'corbeau']);
