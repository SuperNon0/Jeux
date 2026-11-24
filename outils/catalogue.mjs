#!/usr/bin/env node
// Recopie les phrases des fichiers de rôles et des prénoms dans le catalogue des annonces (public/annonces.json).
// L’action GitHub « Voix du narrateur » crée ensuite les MP3 manquants.
import { readFileSync, writeFileSync } from 'node:fs';
import { listeRoles } from '../public/loup-garou/roles/index.mjs';
import { phrasesAvecPrenom, prenoms } from '../regles.mjs';

const fichierCatalogue = new URL('../public/annonces.json', import.meta.url);

// appel → « corbeau », fin → « fin-corbeau », role → « role-corbeau », victoire → « victoire-corbeau »,
// toute autre clé → « corbeau-<clé> ».
export function cleDePhrase(role, cle) {
  if (cle === 'appel') return role;
  if (['fin', 'role', 'victoire'].includes(cle)) return `${cle}-${role}`;
  return `${role}-${cle}`;
}

export function phrasesAttendues() {
  const phrases = {};
  for (const role of listeRoles) {
    for (const [cle, texte] of Object.entries(role.phrases ?? {})) phrases[cleDePhrase(role.id, cle)] = texte;
  }
  for (const [cle, nom] of Object.entries(prenoms)) {
    phrases[`deces-${cle}`] = `${nom} a perdu la vie.`;
    for (const [base, phrase] of Object.entries(phrasesAvecPrenom)) phrases[`${base}-${cle}`] = phrase(nom);
  }
  return phrases;
}

export function catalogueAJour(catalogue = JSON.parse(readFileSync(fichierCatalogue, 'utf8'))) {
  const resultat = { ...catalogue, ...phrasesAttendues() };
  return Object.fromEntries(Object.entries(resultat).sort(([a], [b]) => a.localeCompare(b)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const avant = readFileSync(fichierCatalogue, 'utf8');
  const apres = JSON.stringify(catalogueAJour(JSON.parse(avant)), null, 2) + '\n';
  writeFileSync(fichierCatalogue, apres);
  console.log(avant === apres ? 'Catalogue déjà à jour.' : 'Catalogue des annonces mis à jour.');
}
