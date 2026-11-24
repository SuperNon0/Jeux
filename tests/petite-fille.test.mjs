import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { roles } from '../regles.mjs';

test('la Petite Fille n’est jamais appelée et n’a que sa phrase de révélation', () => {
  const role = roles['petite-fille'];
  assert.equal(role.nom, 'Petite Fille');
  assert.equal(role.nuit, undefined);
  assert.deepEqual(Object.keys(role.phrases), ['role']);
  assert.ok(role.explication.length >= 3);
  const cartes = { Alice: 'villageois', Bastien: 'petite-fille', Camille: 'villageois', Diane: 'loups', Élie: 'villageois' };
  const joueurs = Object.keys(cartes).map(id => ({ id, nom: id }));
  const composition = {};
  for (const r of Object.values(cartes)) composition[r] = (composition[r] ?? 0) + 1;
  const p = new Partie(joueurs, { ...verifierConfiguration(joueurs.length, composition), hote: 'Alice', annoncesEliminations: true });
  p.cartes = new Map(Object.entries(cartes));
  for (const { id } of joueurs) p.agir(id, p.vue(id).numero, null);
  p.agir('Alice', p.vue('Alice').numero, null);
  assert.equal(p.tour.type, 'loups');
  assert.equal(p.vue('Bastien').action, null);
  p.agir('Diane', p.vue('Diane').numero, 'Bastien');
  assert.ok(p.annonces.some(a => a.fichier === 'role-petite-fille'));
});
