import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from '../partie.mjs';
import { votePasse } from '../regles.mjs';

function partie(cartes, options = {}) {
  const joueurs = Object.keys(cartes).map(id => ({ id, nom: id }));
  const composition = {};
  for (const role of Object.values(cartes)) composition[role] = (composition[role] ?? 0) + 1;
  const p = new Partie(joueurs, { ...verifierConfiguration(joueurs.length, composition), hote: joueurs[0].id, ...options });
  p.cartes = new Map(Object.entries(cartes));
  for (const { id } of joueurs) jouer(p, id);
  jouer(p, joueurs[0].id);
  return p;
}
const jouer = (p, id, choix = null) => p.agir(id, p.vue(id).numero, choix);
const village = { Noë: 'villageois', Julien: 'sorciere', Maël: 'loups', Marine: 'villageois', Clara: 'villageois' };

test('le maire est élu au réveil de la première nuit, avant le débat, avec son prénom', () => {
  const p = partie(village, { maire: true });
  jouer(p, 'Maël', 'Clara');
  jouer(p, 'Julien', { soin: false, poison: null });
  assert.equal(p.tour.type, 'election');
  for (const id of p.tour.acteurs) jouer(p, id, 'Marine');
  assert.equal(p.tour.type, 'debat');
  assert.deepEqual(p.annonces.slice(-2).map(a => a.fichier), ['maire-elu-marine', 'debut-debat']);
  assert.equal(p.vue('Noë').resultatElection, 'Le village a choisi son maire : c’est Marine.');
});

test('les morts du journal ne montrent leur cause que si l’hôte le permet', () => {
  const p = partie(village);
  jouer(p, 'Maël', 'Clara');
  jouer(p, 'Julien', { soin: false, poison: 'Marine' });
  assert.deepEqual(p.vue('Noë').morts.map(m => m.cause), [undefined, undefined]);
  p.config.causesVisibles = true;
  assert.deepEqual(p.vue('Noë').morts.map(m => `${m.nom} · ${m.cause}`), ['Clara · attaque des loups', 'Marine · poison de la Sorcière']);
});

test('le suivi de l’administration montre les votes des loups, la Sorcière et ses potions', () => {
  const p = partie(village);
  jouer(p, 'Maël', 'Clara');
  jouer(p, 'Julien', { soin: true, poison: null });
  const suivi = p.suivi();
  assert.ok(suivi.chronique.some(e => e.texte === 'Loups : Maël → Clara. Cible : Clara (Villageois).'));
  assert.ok(suivi.chronique.some(e => e.texte === 'La Sorcière (Julien) sauve Clara (Villageois).'));
  assert.ok(suivi.etats.includes('Sorcière : soin utilisé, poison disponible.'));
  assert.equal(suivi.joueurs.find(j => j.nom === 'Maël').role, 'Loup-Garou');
  jouer(p, 'Noë');
  for (const id of ['Noë', 'Julien', 'Marine']) jouer(p, id, 'Maël');
  assert.deepEqual(p.suivi().enCours.filter(c => c.choix).map(c => `${c.nom} → ${c.choix}`), ['Noë → Maël', 'Julien → Maël', 'Marine → Maël']);
});

test('passer le vote : unanimité, décision du maire et tous les votes', () => {
  const unanime = partie(village, { passageVote: 'unanimite', passagePortee: 'tous' });
  jouer(unanime, 'Maël', 'Clara');
  jouer(unanime, 'Julien', { soin: true, poison: null });
  jouer(unanime, 'Noë');
  for (const id of ['Noë', 'Julien', 'Maël', 'Marine']) jouer(unanime, id, votePasse);
  assert.notEqual(unanime.annonces.at(-1).fichier, 'vote-passe');
  jouer(unanime, 'Clara', votePasse);
  assert.equal(unanime.annonces.at(-1).fichier, 'vote-passe');
  jouer(unanime, 'Noë');
  jouer(unanime, 'Maël', 'Clara');
  jouer(unanime, 'Julien', { poison: null, soin: false });
  jouer(unanime, 'Noë');
  assert.equal(unanime.jour, 2);
  assert.equal(unanime.vue('Noë').action.peutPasserVote, 'unanimite');

  const maire = partie(village, { maire: true, passageVote: 'maire' });
  jouer(maire, 'Maël', 'Clara');
  jouer(maire, 'Julien', { soin: true, poison: null });
  for (const id of maire.tour.acteurs) jouer(maire, id, 'Marine');
  jouer(maire, 'Noë');
  assert.equal(maire.vue('Noë').action.peutPasserVote, undefined);
  assert.throws(() => jouer(maire, 'Noë', votePasse), /joueur disponible/);
  assert.equal(maire.vue('Marine').action.peutPasserVote, 'maire');
  jouer(maire, 'Marine', votePasse);
  assert.equal(maire.tour.type, 'attenteNuit');
  assert.equal(maire.annonces.at(-1).fichier, 'vote-passe');

  const ferme = partie(village, { passageVote: 'non' });
  jouer(ferme, 'Maël', 'Clara');
  jouer(ferme, 'Julien', { soin: true, poison: null });
  jouer(ferme, 'Noë');
  assert.equal(ferme.vue('Noë').action.peutPasserVote, undefined);
});

test('les phrases du vote, du chagrin et du Chasseur disent le prénom sans répéter la piste de décès', () => {
  const p = partie({ Noë: 'chasseur', Julien: 'cupidon', Maël: 'loups', Marine: 'villageois', Clara: 'villageois', Enzo: 'villageois' },
    { annoncesEliminations: true });
  jouer(p, 'Julien', ['Marine', 'Clara']);
  jouer(p, 'Maël', 'Enzo');
  jouer(p, 'Noë');
  for (const id of [...p.vivants]) jouer(p, id, 'Noë');
  const fichiers = p.annonces.map(a => a.fichier);
  assert.deepEqual(fichiers.slice(fichiers.indexOf('resultat-vote-noe')), ['resultat-vote-noe', 'role-chasseur', 'chasseur-noe']);
  jouer(p, 'Noë', 'Marine');
  const fin = p.annonces.map(a => a.fichier);
  assert.deepEqual(fin.slice(fin.indexOf('tir-chasseur-marine'), fin.indexOf('tir-chasseur-marine') + 4),
    ['tir-chasseur-marine', 'role-villageois', 'mort-amoureux-clara', 'role-villageois']);
});

test('les morts voient le suivi de la partie, pas les vivants', () => {
  const p = partie(village);
  jouer(p, 'Maël', 'Clara');
  jouer(p, 'Julien', { soin: false, poison: null });
  assert.equal(p.vue('Noë').suivi, undefined);
  assert.equal(p.vue('Clara').suivi.joueurs.find(j => j.nom === 'Maël').role, 'Loup-Garou');
});

test('un maire mort qui ne désigne personne à temps laisse le sort choisir son successeur', () => {
  const p = partie(village, { maire: true });
  jouer(p, 'Maël', 'Clara');
  jouer(p, 'Julien', { soin: false, poison: null });
  for (const id of p.tour.acteurs) jouer(p, id, 'Noë');
  jouer(p, 'Noë');
  for (const id of ['Noë', 'Julien', 'Marine']) jouer(p, id, 'Noë');
  jouer(p, 'Maël', 'Noë');
  assert.equal(p.tour.type, 'succession');
  p.passer(['Noë']);
  assert.ok(p.vivants.has(p.maire));
  assert.ok(p.annonces.some(a => a.fichier === 'tirage-au-sort'));
});

test('chaque amoureux connaît la carte de l’autre', () => {
  const p = partie({ Noë: 'villageois', Julien: 'cupidon', Maël: 'loups', Marine: 'voyante', Clara: 'villageois' });
  jouer(p, 'Julien', ['Maël', 'Marine']);
  assert.equal(p.vue('Maël').roleAmoureux, 'voyante');
  assert.equal(p.vue('Marine').roleAmoureux, 'loups');
  assert.equal(p.vue('Noë').roleAmoureux, undefined);
});
