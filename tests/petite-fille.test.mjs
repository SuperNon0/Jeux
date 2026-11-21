import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { roles } from '../regles.mjs';

// Bastien est la Petite Fille, Diane et Maël les loups.
function partie() {
  const cartes = { Alice: 'villageois', Bastien: 'petite-fille', Camille: 'villageois', Diane: 'loups', Maël: 'loups', Élie: 'villageois', Félix: 'villageois' };
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

test('la Petite Fille n’est jamais appelée et n’a que sa phrase de révélation', () => {
  assert.equal(roles['petite-fille'].nuit, undefined);
  assert.deepEqual(Object.keys(roles['petite-fille'].phrases), ['role']);
  const p = partie();
  assert.equal(p.tour.type, 'loups');
  assert.ok(!p.annonces.some(a => a.fichier?.includes('petite-fille')));
});

test('pendant le tour des loups, la Petite Fille espionne une fois par nuit', () => {
  const p = partie();
  assert.equal(p.vue('Camille').espion, undefined);
  assert.equal(p.vue('Bastien').phase, 'nuit');
  jouer(p, 'Diane', 'Félix');
  const { espion } = p.vue('Bastien');
  assert.equal(espion.bouton, 'Espionner les loups');
  p.agir('Bastien', espion.numero, 'espionner');
  assert.match(p.vue('Bastien').infoRole, /Nuit 1 : les loups visaient Félix, un loup commence par [DM]\./);
  assert.deepEqual(p.vue('Bastien').espion, { fait: true });
  assert.throws(() => p.agir('Bastien', espion.numero, 'espionner'), /pas espionner/);
  assert.throws(() => p.agir('Camille', espion.numero, 'espionner'), /plus disponible/);
  jouer(p, 'Maël', 'Félix');
  assert.equal(p.vue('Bastien').espion, undefined);
  assert.throws(() => p.agir('Bastien', p.numero, 'espionner'));
});

test('une fois sur trois environ, les loups repèrent la Petite Fille', () => {
  let reperee = 0;
  for (let i = 0; i < 300; i++) {
    const p = partie();
    p.agir('Bastien', p.vue('Bastien').espion.numero, 'espionner');
    const alerte = p.vue('Diane').action.info;
    if (alerte) {
      reperee++;
      assert.match(alerte, /Petite Fille.*Bastien/);
    }
  }
  assert.ok(reperee > 60 && reperee < 140, `repérée ${reperee} fois sur 300`);
});
