import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

test('partie complète sur cinq sessions, avec reprise privée, départages et succession', async t => {
  const serveur = spawn(process.execPath, ['serveur.mjs'], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
  });
  t.after(() => serveur.kill());
  const [message] = await once(serveur.stdout, 'data');
  const origine = `http://127.0.0.1:${String(message).match(/port (\d+)/)[1]}`;
  async function post(chemin, data = {}, token, statut = 200) {
    const response = await fetch(origine + '/api/salons' + chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(data),
    });
    const resultat = await response.json();
    assert.equal(response.status, statut, JSON.stringify(resultat));
    return resultat;
  }
  const hote = await post('', {
    nom: 'Alice', total: 5, maire: true, discret: true,
    composition: { villageois: 1, loups: 1, voyante: 1, sorciere: 1, chasseur: 1 },
  }, undefined, 201);
  const room = '/' + hote.code + '/';
  const clients = [hote];
  for (const nom of ['Bastien', 'Camille', 'Diane', 'Élie']) clients.push(await post(room + 'rejoindre', { nom }));
  const invitation = origine + '/?salon=' + hote.code;
  const qr = await fetch(origine + '/api/salons' + room + 'qr?url=' + encodeURIComponent(invitation));
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal((await qr.arrayBuffer()).byteLength > 500, true);
  const index = await fetch(origine + '/');
  assert.match(await index.text(), /Loup-Garou/);
  const audio = await fetch(origine + '/audio/le-village-sendort.mp3', { headers: { Range: 'bytes=0-2' } });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await audio.arrayBuffer()).byteLength, 3);
  await post(room + 'lancer', {}, clients[1].token, 403);
  await post(room + 'lancer', {}, hote.token);

  const etat = client => post(room + 'etat', {}, client.token);
  async function agir(client, choix = null, phase) {
    const { partie } = await etat(client);
    if (phase) assert.equal(partie.phase, phase);
    assert.ok(partie.action);
    return post(room + 'agir', { numero: partie.numero, choix }, client.token);
  }
  const parRole = {};
  for (const client of clients) {
    const vue = await etat(client);
    client.joueur = vue.joueur;
    parRole[vue.partie.role] = client;
    assert.equal(vue.joueurs.some(j => 'role' in j || 'token' in j), false);
    await agir(client, null, 'distribution');
  }
  const { voyante, loups, sorciere, chasseur, villageois } = parRole;
  const aveugle = await etat(villageois);
  assert.equal(aveugle.partie.phase, 'nuit');
  assert.equal(aveugle.partie.numero, undefined);
  assert.equal(aveugle.partie.annonces.some(a => a.fichier === 'voyante'), false);
  const actionVoyante = (await etat(voyante)).partie.numero;
  await agir(voyante, loups.joueur, 'voyante');
  await post(room + 'agir', { numero: actionVoyante, choix: sorciere.joueur }, voyante.token, 400);
  await agir(loups, chasseur.joueur, 'loups');
  await agir(sorciere, { soin: true, poison: null }, 'sorciere');
  assert.equal((await etat(hote)).partie.vivants.length, 5);

  const { secret } = await post(room + 'recuperer', { joueur: voyante.joueur });
  assert.deepEqual(await post(room + 'reprise', {}, secret), { statut: 'attente' });
  const demande = (await etat(hote)).demandes[0];
  await post(room + 'decision', { id: demande.id, accepte: true }, hote.token);
  await post(room + 'etat', {}, voyante.token, 401);
  const reprise = await post(room + 'reprise', {}, secret);
  voyante.token = reprise.token;
  assert.equal((await etat(voyante)).partie.historique[0].role, 'loups');
  assert.deepEqual((await etat(chasseur)).partie.historique, []);

  await agir(hote, null, 'debat');
  for (const [i, client] of clients.entries()) {
    await agir(client, [chasseur, chasseur, villageois, villageois, loups][i].joueur, 'election');
  }
  await agir(hote, 'revoter', 'egaliteElection');
  for (const client of clients) await agir(client, chasseur.joueur, 'election');
  assert.equal((await etat(villageois)).partie.maire, chasseur.joueur);

  await agir(chasseur, villageois.joueur, 'vote');
  await agir(villageois, chasseur.joueur, 'vote');
  await agir(loups, chasseur.joueur, 'vote');
  await agir(sorciere, voyante.joueur, 'vote');
  await agir(voyante, loups.joueur, 'vote');
  assert.deepEqual(new Set((await etat(chasseur)).partie.action.cibles), new Set([chasseur.joueur, villageois.joueur]));
  await agir(chasseur, chasseur.joueur, 'departage');
  await agir(chasseur, loups.joueur, 'chasseur');
  await agir(chasseur, villageois.joueur, 'succession');
  assert.equal((await etat(hote)).partie.gagnant, 'village');
  assert.equal((await etat(villageois)).partie.maire, villageois.joueur);
  await post(room + 'retour', {}, hote.token);
  assert.equal((await etat(voyante)).partie, null);
});

test('les 24 annonces ont été produites en MP3', async () => {
  const dossier = new URL('./public/audio/', import.meta.url);
  const fichiers = (await readdir(dossier)).filter(nom => nom.endsWith('.mp3'));
  assert.equal(fichiers.length, 24);
  for (const fichier of fichiers) {
    const entree = await readFile(new URL(fichier, dossier));
    const balise = entree.subarray(0, 3).toString() === 'ID3';
    const trame = entree[0] === 0xff && (entree[1] & 0xe0) === 0xe0;
    assert.ok(balise || trame, fichier);
  }
});
