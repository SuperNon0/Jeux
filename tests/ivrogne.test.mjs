import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { roles } from '../regles.mjs';

// Bastien est l’Ivrogne, Diane le loup, Félix le Gardien (identifiant salvateur).
function partie(cartes = { Alice: 'villageois', Bastien: 'ivrogne', Camille: 'villageois', Diane: 'loups', Élie: 'villageois', Félix: 'salvateur' }) {
  const joueurs = Object.keys(cartes).map(id => ({ id, nom: id }));
  const composition = {};
  for (const role of Object.values(cartes)) composition[role] = (composition[role] ?? 0) + 1;
  const p = new Partie(joueurs, { ...verifierConfiguration(joueurs.length, composition), hote: 'Alice' });
  p.cartes = new Map(Object.entries(cartes));
  for (const { id } of joueurs) jouer(p, id);
  jouer(p, 'Alice');
  return p;
}

function jouer(p, id, choix = null) {
  p.agir(id, p.vue(id).numero, choix);
}

// Joue la nuit : le Gardien protège `protege`, l’Ivrogne va chez `hote`, le loup attaque `cible`.
function nuit(p, { protege = null, hote = null, cible }) {
  if (p.tour.type === 'salvateur') jouer(p, 'Félix', protege);
  assert.equal(p.tour.type, 'ivrogne');
  jouer(p, 'Bastien', hote);
  assert.equal(p.tour.type, 'loups');
  jouer(p, 'Diane', cible);
}

test('l’Ivrogne passe avant les loups et s’appelle Ivrogne', () => {
  assert.equal(roles.ivrogne.nom, 'Ivrogne');
  assert.ok(roles.ivrogne.nuit.rang < roles.loups.nuit.rang);
  assert.ok(roles.ivrogne.explication.length >= 3);
});

test('attaqué pendant qu’il dort ailleurs, l’Ivrogne survit', () => {
  const p = partie();
  nuit(p, { hote: 'Camille', cible: 'Bastien' });
  assert.ok(p.vivants.has('Bastien'));
  assert.ok(p.annonces.some(a => a.fichier === 'nuit-sans-victime'));
});

test('si les loups dévorent son hôte, l’Ivrogne meurt avec lui', () => {
  const p = partie();
  nuit(p, { hote: 'Camille', cible: 'Camille' });
  assert.ok(!p.vivants.has('Camille'));
  assert.ok(!p.vivants.has('Bastien'));
  assert.match(p.annonces.find(a => a.fichier === 'nuit-avec-victimes').message, /Camille, Bastien/);
});

test('si le Gardien protège son hôte, l’Ivrogne est sauvé aussi', () => {
  const p = partie();
  nuit(p, { protege: 'Camille', hote: 'Camille', cible: 'Camille' });
  assert.ok(p.vivants.has('Camille'));
  assert.ok(p.vivants.has('Bastien'));
});

test('resté chez lui, l’Ivrogne meurt comme un villageois', () => {
  const p = partie();
  nuit(p, { hote: null, cible: 'Bastien' });
  assert.ok(!p.vivants.has('Bastien'));
});

test('l’Ivrogne ne retourne pas chez la même personne deux nuits de suite', () => {
  const p = partie();
  nuit(p, { hote: 'Camille', cible: 'Élie' });
  jouer(p, 'Alice');
  jouer(p, 'Alice', 'Alice');
  p.passer(p.tour.acteurs.filter(id => !p.tour.reponses.has(id)));
  jouer(p, 'Alice');
  jouer(p, 'Félix', null);
  assert.equal(p.tour.type, 'ivrogne');
  assert.ok(!p.vue('Bastien').action.cibles.includes('Camille'));
  assert.match(p.vue('Bastien').infoRole, /Camille/);
});
