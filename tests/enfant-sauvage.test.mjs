import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { roles } from '../regles.mjs';

// Bastien est l’Enfant sauvage, Diane le loup.
function partie() {
  const cartes = { Alice: 'villageois', Bastien: 'enfant-sauvage', Camille: 'villageois', Diane: 'loups', Élie: 'villageois', Félix: 'villageois' };
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

function voter(p, cible) {
  jouer(p, 'Alice');
  for (const id of [...p.vivants]) jouer(p, id, cible);
}

test('l’Enfant sauvage choisit un modèle la première nuit seulement', () => {
  assert.equal(roles['enfant-sauvage'].nom, 'Enfant sauvage');
  const p = partie();
  assert.equal(p.tour.type, 'enfant-sauvage');
  assert.ok(!p.vue('Bastien').action.cibles.includes('Bastien'));
  assert.throws(() => jouer(p, 'Bastien', null), /joueur disponible/);
  jouer(p, 'Bastien', 'Camille');
  assert.match(p.vue('Bastien').infoRole, /Camille/);
  jouer(p, 'Diane', 'Élie');
  voter(p, 'Félix');
  jouer(p, 'Alice');
  assert.equal(p.tour.type, 'loups');
  assert.ok(!p.annonces.slice(-3).some(a => a.fichier === 'enfant-sauvage'));
});

test('quand son modèle meurt, l’Enfant sauvage rejoint la meute en secret', () => {
  const p = partie();
  jouer(p, 'Bastien', 'Camille');
  jouer(p, 'Diane', 'Camille');
  assert.ok(!p.vivants.has('Camille'));
  assert.equal(p.cartes.get('Bastien'), 'loups');
  assert.ok(!p.annonces.some(a => a.fichier === 'role-enfant-sauvage'));
  assert.deepEqual(p.vue('Diane').allies, ['Bastien']);
  assert.match(p.vue('Bastien').infoRole, /meute/);
  jouer(p, 'Alice');
  p.passer(p.tour.acteurs.filter(id => !p.tour.reponses.has(id)));
  jouer(p, 'Alice');
  assert.equal(p.tour.type, 'loups');
  assert.deepEqual(p.tour.acteurs.sort(), ['Bastien', 'Diane']);
});

test('l’Enfant sauvage transformé compte pour la victoire des loups', () => {
  const p = partie();
  jouer(p, 'Bastien', 'Camille');
  jouer(p, 'Diane', 'Camille');
  voter(p, 'Félix');
  // Il reste Alice, Élie, Diane et Bastien : deux loups sur quatre, la meute gagne.
  assert.equal(p.gagnant, 'loups');
});

test('si son modèle survit, l’Enfant sauvage reste au village', () => {
  const p = partie();
  jouer(p, 'Bastien', 'Camille');
  jouer(p, 'Diane', 'Élie');
  assert.equal(p.cartes.get('Bastien'), 'enfant-sauvage');
});
