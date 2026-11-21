import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { test } from 'node:test';
import { Partie, verifierConfiguration } from './partie.mjs';

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
  const premierePartie = (await etat(hote)).partie;
  const style = await fetch(origine + '/encre.css');
  assert.equal(style.status, 200);
  const police = await fetch(origine + '/polices/archivo-latin.woff2');
  assert.equal(police.headers.get('content-type'), 'font/woff2');
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
  const lancement = (await etat(hote)).partie;
  assert.equal(lancement.phase, 'lancement');
  assert.deepEqual(lancement.annonces.map(a => a.fichier), ['distribution']);
  await post(room + 'agir', { numero: lancement.numero, choix: null }, clients[1].token, 400);
  await agir(hote, null, 'lancement');
  const { voyante, loups, sorciere, chasseur, villageois } = parRole;
  for (const client of clients) await post(room + 'absence', {}, client.token);
  const apercu = await post(room + 'apercu', {}, hote.token);
  assert.equal(apercu.statut, 'pause');
  assert.equal(apercu.enLigne, 0);
  assert.equal(apercu.jour, 1);
  assert.equal(apercu.role, undefined);
  assert.equal((await post(room + 'apercu', {}, voyante.token)).enLigne, 0);
  const reprisePartie = await etat(voyante);
  assert.equal(reprisePartie.resume.statut, 'en-cours');
  assert.equal(reprisePartie.partie.id, premierePartie.id);
  assert.equal(reprisePartie.partie.role, 'voyante');
  const aveugle = await etat(villageois);
  assert.equal(aveugle.partie.phase, 'nuit');
  assert.equal(aveugle.partie.numero, undefined);
  assert.equal(aveugle.partie.annonces.some(a => a.fichier === 'voyante'), false);
  const actionVoyante = (await etat(voyante)).partie.numero;
  const revelation = await agir(voyante, loups.joueur, 'voyante');
  assert.equal(revelation.partie.historique.at(-1).role, 'loups');
  assert.deepEqual((await etat(villageois)).partie.historique, []);
  assert.equal((await etat(villageois)).partie.annonces.some(a => ['voyante', 'fin-voyante'].includes(a.fichier)), false);
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
  assert.equal(Object.keys((await etat(hote)).partie.bilan).length, 5);
  await post(room + 'retour', {}, hote.token);
  assert.equal((await etat(voyante)).partie, null);

  await post(room + 'lancer', {}, hote.token);
  const deuxiemePartie = (await etat(hote)).partie;
  assert.notEqual(deuxiemePartie.id, premierePartie.id);
  await post(room + 'agir', { numero: premierePartie.numero, choix: null }, hote.token, 400);
  assert.equal((await etat(hote)).partie.progression.reponses, 0);
});

test('les 42 annonces et le cri du Corbeau sont disponibles en MP3', async () => {
  const dossier = new URL('./public/audio/', import.meta.url);
  const fichiers = (await readdir(dossier)).filter(nom => nom.endsWith('.mp3'));
  assert.equal(fichiers.length, 43);
  for (const fichier of fichiers) {
    const entree = await readFile(new URL(fichier, dossier));
    const balise = entree.subarray(0, 3).toString() === 'ID3';
    const trame = entree[0] === 0xff && (entree[1] & 0xe0) === 0xe0;
    assert.ok(balise || trame, fichier);
  }
});

function partieAvecRoles(cartes, options = {}) {
  const joueurs = Object.keys(cartes).map(id => ({ id, nom: id }));
  const composition = {};
  for (const role of Object.values(cartes)) composition[role] = (composition[role] ?? 0) + 1;
  const config = { ...verifierConfiguration(joueurs.length, composition), hote: joueurs[0].id, ...options };
  const partie = new Partie(joueurs, config);
  partie.cartes = new Map(Object.entries(cartes));
  for (const { id } of joueurs) jouer(partie, id);
  jouer(partie, joueurs[0].id);
  return partie;
}

function jouer(partie, id, choix = null) {
  partie.agir(id, partie.vue(id).numero, choix);
}

function finirVoteAvecAbstentions(partie) {
  partie.passer(partie.tour.acteurs.filter(id => !partie.tour.reponses.has(id)));
}

test('le Salvateur protège avant que l’Ancien ou la Sorcière n’interviennent', () => {
  let partie = partieAvecRoles({
    Alice: 'villageois', Bastien: 'salvateur', Camille: 'ancien', Diane: 'sorciere',
    Élie: 'loups', Félix: 'villageois', Gaëlle: 'villageois',
  });
  assert.ok(partie.vue('Bastien').action.cibles.includes('Bastien'));
  jouer(partie, 'Bastien', 'Camille');
  partie = Partie.charger(JSON.parse(JSON.stringify(partie.sauvegarde())), partie.joueurs, partie.config);
  jouer(partie, 'Élie', 'Camille');
  assert.equal(partie.vue('Diane').action.soin, false);
  jouer(partie, 'Diane', { soin: false, poison: null });
  jouer(partie, 'Alice');
  jouer(partie, 'Alice', 'Félix');
  finirVoteAvecAbstentions(partie);
  jouer(partie, 'Alice');
  assert.ok(!partie.vue('Bastien').action.cibles.includes('Camille'));
  jouer(partie, 'Bastien');
  jouer(partie, 'Élie', 'Camille');
  assert.equal(partie.vue('Diane').action.soin, false);
  jouer(partie, 'Diane', { soin: false, poison: null });
  jouer(partie, 'Alice');
  jouer(partie, 'Alice', 'Gaëlle');
  finirVoteAvecAbstentions(partie);
  jouer(partie, 'Alice');
  assert.ok(partie.vue('Bastien').action.cibles.includes('Camille'));
  jouer(partie, 'Bastien', 'Bastien');
  jouer(partie, 'Élie', 'Camille');
  assert.equal(partie.vue('Diane').action.victime, 'Camille');
  jouer(partie, 'Diane', { soin: false, poison: null });
  assert.ok(!partie.vue('Alice').vivants.includes('Camille'));
});

test('la marque du Corbeau compte au premier vote d’élimination uniquement', () => {
  const partie = partieAvecRoles({
    Alice: 'villageois', Bastien: 'corbeau', Camille: 'ancien',
    Diane: 'villageois', Élie: 'loups', Félix: 'villageois',
  }, { maire: true, discret: true });
  jouer(partie, 'Élie', 'Camille');
  assert.equal(partie.vue('Alice').marqueCorbeau, null);
  assert.ok(!partie.vue('Bastien').action.cibles.includes('Bastien'));
  jouer(partie, 'Bastien', 'Félix');
  assert.equal(partie.vue('Alice').marqueCorbeau, 'Félix');
  assert.ok(!partie.annonces.some(a => ['corbeau', 'cri-corbeau', 'fin-corbeau'].includes(a.fichier)));
  jouer(partie, 'Alice');
  jouer(partie, 'Alice', 'Alice');
  finirVoteAvecAbstentions(partie);
  assert.equal(partie.vue('Alice').maire, 'Alice');
  jouer(partie, 'Alice', 'Camille');
  finirVoteAvecAbstentions(partie);
  assert.deepEqual(partie.vue('Alice').action.cibles, ['Camille', 'Félix']);
  assert.equal(partie.vue('Alice').phase, 'departage');
  assert.equal(partie.vue('Alice').marqueCorbeau, null);
});

test('le cri du Corbeau suit une action validée, avant le réveil', () => {
  const cartes = { Alice: 'villageois', Bastien: 'corbeau', Camille: 'ancien', Diane: 'loups', Élie: 'villageois' };
  const partie = partieAvecRoles(cartes);
  jouer(partie, 'Diane', 'Camille');
  assert.throws(() => jouer(partie, 'Bastien', 'Bastien'), /joueur disponible/);
  assert.ok(!partie.annonces.some(a => a.fichier === 'cri-corbeau'));
  jouer(partie, 'Bastien', 'Élie');
  const annonces = partie.annonces.map(a => a.fichier);
  const index = annonces.indexOf('corbeau');
  assert.deepEqual(annonces.slice(index, index + 7), [
    'corbeau', 'cri-corbeau', 'fin-corbeau', 'le-village-se-reveille', 'nuit-sans-victime', 'marque-corbeau', 'debut-debat',
  ]);
  const absence = partieAvecRoles(cartes);
  jouer(absence, 'Diane', 'Camille');
  absence.passer(['Bastien']);
  assert.ok(!absence.annonces.some(a => a.fichier === 'cri-corbeau'));
});

test('Cupidon lie en privé deux personnes distinctes lors de la première nuit', () => {
  const partie = partieAvecRoles({
    Alice: 'cupidon', Bastien: 'loups', Camille: 'loups', Diane: 'villageois', Élie: 'villageois',
  });
  assert.equal(partie.vue('Camille').phase, 'nuit');
  assert.throws(() => jouer(partie, 'Alice', ['Alice', 'Alice']), /deux joueurs différents/);
  jouer(partie, 'Alice', ['Alice', 'Bastien']);
  assert.equal(partie.vue('Alice').amoureux, 'Bastien');
  assert.equal(partie.vue('Bastien').amoureux, 'Alice');
  assert.equal(partie.vue('Camille').amoureux, undefined);
  assert.deepEqual(partie.annonces.slice(2, 6).map(a => a.fichier), ['cupidon', 'fin-cupidon', 'amoureux-lies', 'loups']);
  jouer(partie, 'Bastien', 'Élie');
  jouer(partie, 'Camille', 'Élie');
  assert.equal(partie.vue('Alice').phase, 'debat');
  jouer(partie, 'Alice');
  jouer(partie, 'Alice', 'Camille');
  finirVoteAvecAbstentions(partie);
  jouer(partie, 'Alice');
  assert.equal(partie.vue('Bastien').phase, 'loups');
  jouer(partie, 'Bastien', 'Diane');
  assert.equal(partie.vue('Alice').gagnant, 'amoureux');
  assert.deepEqual(partie.vue('Alice').vivants, ['Alice', 'Bastien']);
  assert.equal(partie.annonces.at(-1).fichier, 'victoire-amoureux');
});

test('une mort de chagrin s’applique une fois et reste compatible avec le Chasseur', () => {
  const partie = partieAvecRoles({
    Alice: 'cupidon', Bastien: 'chasseur', Camille: 'loups', Diane: 'villageois', Élie: 'villageois',
  }, { discret: true });
  jouer(partie, 'Alice', ['Alice', 'Bastien']);
  jouer(partie, 'Camille', 'Bastien');
  assert.equal(partie.vue('Bastien').phase, 'chasseur');
  assert.ok(!partie.vue('Bastien').vivants.includes('Alice'));
  assert.equal(partie.annonces.filter(a => a.fichier === 'mort-amoureux').length, 1);
  assert.ok(!partie.annonces.some(a => ['cupidon', 'fin-cupidon', 'amoureux-lies'].includes(a.fichier)));
  jouer(partie, 'Bastien', 'Camille');
  assert.equal(partie.vue('Diane').gagnant, 'village');

  const victimesDirectes = partieAvecRoles({
    Alice: 'cupidon', Bastien: 'villageois', Camille: 'loups', Diane: 'sorciere', Élie: 'villageois',
  });
  jouer(victimesDirectes, 'Alice', ['Alice', 'Bastien']);
  jouer(victimesDirectes, 'Camille', 'Alice');
  jouer(victimesDirectes, 'Diane', { soin: false, poison: 'Bastien' });
  assert.ok(!victimesDirectes.vue('Camille').vivants.some(id => ['Alice', 'Bastien'].includes(id)));
  assert.ok(!victimesDirectes.annonces.some(a => a.fichier === 'mort-amoureux'));
});

test('le sommeil attend la confirmation de l’hôte après les votes et le résultat', () => {
  const cartes = { Alice: 'villageois', Bastien: 'villageois', Camille: 'villageois',
    Diane: 'villageois', Élie: 'loups', Félix: 'ancien' };
  const compte = partie => partie.annonces.filter(a => a.fichier === 'le-village-sendort').length;
  const partie = partieAvecRoles(cartes);
  jouer(partie, 'Élie', 'Félix');
  jouer(partie, 'Alice');
  jouer(partie, 'Alice', 'Diane');
  assert.equal(partie.vue('Bastien').phase, 'vote');
  assert.equal(compte(partie), 1);
  for (const id of partie.tour.acteurs.slice(1)) jouer(partie, id, 'Diane');
  assert.equal(partie.vue('Alice').phase, 'attenteNuit');
  assert.equal(partie.annonces.at(-1).fichier, 'resultat-vote');
  assert.equal(compte(partie), 1);
  assert.throws(() => jouer(partie, 'Bastien'), /plus disponible/);
  jouer(partie, 'Alice');
  assert.equal(compte(partie), 2);
  assert.equal(partie.vue('Élie').phase, 'loups');

  const delai = partieAvecRoles(cartes, { voteSecondes: 30 });
  jouer(delai, 'Élie', 'Félix');
  jouer(delai, 'Alice');
  assert.equal(delai.actualiserTemps(delai.tour.echeance), true);
  assert.equal(delai.vue('Alice').phase, 'attenteNuit');
  assert.equal(delai.annonces.at(-1).fichier, 'aucun-vote-elimination');
  assert.equal(compte(delai), 1);
  jouer(delai, 'Alice');
  assert.equal(compte(delai), 2);
});

test('une seconde égalité sans maire peut être départagée au tirage', () => {
  const joueurs = ['Alice', 'Bastien', 'Camille', 'Diane', 'Élie'].map(nom => ({ id: nom, nom }));
  const config = verifierConfiguration(5, { villageois: 4, loups: 1 });
  const partie = new Partie(joueurs, { ...config, hote: 'Alice', maire: false });
  const action = (id, choix = null) => partie.agir(id, partie.vue(id).numero, choix);
  for (const { id } of joueurs) action(id);
  action('Alice');
  const loup = joueurs.find(({ id }) => partie.vue(id).role === 'loups').id;
  action(loup, joueurs.find(({ id }) => id !== loup).id);
  action('Alice');
  const vivants = partie.vue('Alice').vivants;
  for (const vote of [0, 1]) {
    for (const [i, id] of vivants.entries()) action(id, vivants[i % 2]);
    assert.equal(partie.vue('Alice').phase, vote ? 'egaliteVote' : 'vote');
  }
  action('Alice', 'tirer');
  const elimines = vivants.filter(id => !partie.vue('Alice').vivants.includes(id));
  assert.equal(elimines.length, 1);
  assert.ok(vivants.slice(0, 2).includes(elimines[0]));
});


test('l’administration Cloudflare réserve les démos, les réglages, les salons et la mise à jour au lien hôte', async t => {
  const equipe = 'https://test.cloudflareaccess.com';
  const aud = 'audience-de-test';
  const hote = 'hote.example.test';
  const invite = 'jouer.example.test';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const cle = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const ticket = audience => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(equipe)
    .setAudience(audience).setSubject('administration').setIssuedAt().setExpirationTime('2m').sign(privateKey);
  const jeton = await ticket(aud);
  const fauxJeton = await ticket('autre-audience');

  const dossier = await mkdtemp(join(tmpdir(), 'jeux-admin-test-'));
  await mkdir(join(dossier, 'audio'));
  await mkdir(join(dossier, 'maintenance', 'commandes'), { recursive: true });
  const interception = `data:text/javascript,${encodeURIComponent(`
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (url, options) => String(url) === '${equipe}/cdn-cgi/access/certs'
      ? Promise.resolve(Response.json({keys: [${JSON.stringify(cle)}]})) : fetchOriginal(url, options);
  `)}`;
  let serveur;
  let adresse;
  async function demarrer() {
    serveur = spawn(process.execPath, ['--import', interception, 'serveur.mjs'], { env: {
      ...process.env, PORT: '0', HOST: '127.0.0.1', JEUX_ETAT: dossier,
      JEUX_URL_HOTE: `https://${hote}`, JEUX_URL_INVITES: `https://${invite}`, CF_ACCESS_TEAM_DOMAIN: equipe, CF_ACCESS_AUD: aud,
    } });
    const [message] = await once(serveur.stdout, 'data');
    adresse = `http://127.0.0.1:${String(message).match(/port (\d+)/)[1]}`;
  }
  async function arreter() {
    const sortie = once(serveur, 'exit');
    serveur.kill();
    await sortie;
  }
  t.after(async () => { if (serveur?.exitCode === null) await arreter(); await rm(dossier, { recursive: true, force: true }); });
  await demarrer();
  async function appel(chemin, { domaine = hote, jwt = domaine === hote ? jeton : undefined, donnees, token, audio, origin } = {}) {
    const entetes = { Host: domaine };
    if (jwt) entetes['Cf-Access-Jwt-Assertion'] = jwt;
    if (token) entetes.Authorization = `Bearer ${token}`;
    if (origin) entetes.Origin = origin;
    if (donnees) entetes['Content-Type'] = 'application/json';
    if (audio) entetes['Content-Type'] = 'audio/mpeg';
    return new Promise((resoudre, rejeter) => {
      const requete = request(adresse + chemin, { method: audio ? 'PUT' : donnees ? 'POST' : 'GET', headers: entetes }, async reponse => {
        const fragments = [];
        for await (const fragment of reponse) fragments.push(fragment);
        resoudre(new Response(Buffer.concat(fragments), { status: reponse.statusCode, headers: reponse.headers }));
      });
      requete.on('error', rejeter);
      requete.end(audio ?? (donnees ? JSON.stringify(donnees) : undefined));
    });
  }

  assert.equal((await appel('/api/admin', { jwt: '' })).status, 403);
  assert.equal((await appel('/api/admin', { jwt: fauxJeton })).status, 403);
  assert.equal((await appel('/api/admin', { domaine: invite, jwt: jeton })).status, 403);
  assert.equal((await appel('/api/configuration', { domaine: invite })).status, 200);
  assert.equal((await appel('/api/configuration', { domaine: 'autre.example.test' })).status, 421);
  const regles = { nom: 'Admin', total: 5, composition: { villageois: 4, loups: 1 } };
  assert.equal((await appel('/api/salons', { domaine: invite, donnees: regles })).status, 403);
  assert.equal((await appel('/api/salons', { donnees: regles, origin: `https://${invite}` })).status, 403);
  const hoteSalon = await (await appel('/api/salons', { donnees: regles })).json();
  const room = `/api/salons/${hoteSalon.code}/`;
  assert.equal((await appel(room + 'etat', { domaine: invite, token: hoteSalon.token, donnees: {} })).status, 403);
  const inviteSalon = await appel(room + 'rejoindre', { domaine: invite, donnees: { nom: 'Invité' } });
  assert.equal(inviteSalon.status, 200);
  const lien = `/?salon=${hoteSalon.code}`;
  for (const [domaine, code] of [[hote, 400], [invite, 200]]) {
    assert.equal((await appel(room + 'qr?url=' + encodeURIComponent(`https://${domaine}${lien}`))).status, code);
  }
  const avant = await (await appel('/api/admin')).json();
  assert.equal(avant.salons[0].code, hoteSalon.code);
  assert.equal(avant.salons[0].joueurs, 2);
  assert.equal(avant.audios.length, 43);
  assert.ok(avant.annonces.includes('victoire-amoureux'));
  const illustration = await appel('/illustrations/roles-extension.png', { domaine: invite });
  assert.equal(illustration.headers.get('content-type'), 'image/png');
  assert.equal(illustration.status, 200);

  const cheminAudio = '/api/admin/audio/test-annonce.mp3';
  const fichier = await readFile(new URL('./public/audio/le-village-sendort.mp3', import.meta.url));
  assert.equal((await appel(cheminAudio, { domaine: invite, audio: fichier })).status, 403);
  assert.equal((await appel(cheminAudio, { audio: Buffer.from('faux MP3') })).status, 422);
  assert.equal((await appel(cheminAudio, { audio: fichier })).status, 200);
  assert.deepEqual(Buffer.from(await (await appel('/audio/test-annonce.mp3')).arrayBuffer()), fichier);
  const apres = await (await appel('/api/admin')).json();
  assert.deepEqual(apres.audios.find(a => a.nom === 'test-annonce.mp3'), { nom: 'test-annonce.mp3', fourni: false, personnalise: true });

  const audioReglage = { evenement: 'distribution', fichier: 'test-annonce.mp3', volume: 73 };
  assert.equal((await appel('/api/admin/son', { domaine: invite, donnees: audioReglage })).status, 403);
  assert.equal((await appel('/api/admin/son', { donnees: { ...audioReglage, fichier: 'inconnu.mp3' } })).status, 400);
  assert.equal((await appel('/api/admin/son', { donnees: audioReglage })).status, 200);
  const reglage = await (await appel('/api/configuration', { domaine: invite })).json();
  assert.deepEqual(reglage.son, { associations: { distribution: 'test-annonce.mp3' }, volume: 73 });

  const maj = '/api/admin/miseajour';
  assert.equal((await appel(maj, { domaine: invite, donnees: { confirme: true } })).status, 403);
  assert.equal((await appel(maj, { donnees: { confirme: false } })).status, 400);
  assert.equal((await appel(maj, { donnees: { confirme: true } })).status, 202);
  assert.equal((await appel(maj, { donnees: { confirme: true } })).status, 409);

  const templates = '/api/admin/compositions';
  const composition = { ...regles, nom: 'Partie du vendredi', maire: true, voteSecondes: 45 };
  assert.equal((await appel(templates, { domaine: invite, donnees: composition })).status, 403);
  assert.equal((await appel(templates, { donnees: { ...composition, voteSecondes: 3 } })).status, 400);
  const creation = await (await appel(templates, { donnees: composition })).json();
  const id = creation.composition.id;
  const modification = { ...composition, id, nom: 'Partie du samedi', voteSecondes: 60 };
  const reglee = (await (await appel(templates, { donnees: modification })).json()).composition;
  assert.equal(reglee.id, id);
  assert.equal(reglee.voteSecondes, 60);
  assert.equal(reglee.maire, true);
  assert.equal((await (await appel('/api/configuration', { domaine: invite })).json()).compositions, undefined);

  const sessionInvite = await inviteSalon.json();
  const gestion = `/api/admin/salons/${hoteSalon.code}/`;
  assert.equal((await appel(gestion + 'terminer', { domaine: invite, donnees: { confirme: true } })).status, 403);
  assert.equal((await appel(gestion + 'terminer', { donnees: {} })).status, 400);
  assert.equal((await appel(gestion + 'terminer', { donnees: { confirme: true } })).status, 200);
  const fermee = await (await appel(room + 'etat', { domaine: invite, token: sessionInvite.token, donnees: {} })).json();
  assert.equal(fermee.resume.statut, 'cloturee');
  assert.equal(fermee.partie, null);
  assert.equal((await appel(room + 'rejoindre', { domaine: invite, donnees: { nom: 'Autre invité' } })).status, 410);

  assert.equal((await appel('/api/demo', { domaine: invite, donnees: {} })).status, 403);
  assert.equal((await appel('/api/demo', { jwt: '', donnees: {} })).status, 403);
  const reponseDemo = await appel('/api/demo', { donnees: {} });
  assert.equal(reponseDemo.status, 201);
  const demo = await reponseDemo.json();
  const demoRacine = `/api/salons/${demo.code}/`;
  const demoAppel = (action, donnees = {}) => appel(demoRacine + action, { donnees, token: demo.token });
  const demoEtat = async () => (await demoAppel('etat')).json();
  assert.equal((await appel(demoRacine + 'etat', { domaine: invite, donnees: {}, token: demo.token })).status, 404);
  const decompte = await demoEtat();
  assert.equal(decompte.config.maire, true);
  assert.equal(decompte.partie.role, 'voyante');
  assert.equal(decompte.partie.progression.reponses, 4);
  await demoAppel('agir', { numero: decompte.partie.numero, choix: null });
  const lancementDemo = (await demoEtat()).partie;
  assert.equal(lancementDemo.phase, 'lancement');
  await demoAppel('narration', { active: true });
  await demoAppel('agir', { numero: lancementDemo.numero, choix: null });
  const reveil = (await demoEtat()).partie;
  await demoAppel('agir', { numero: reveil.numero, choix: reveil.action.cibles[0] });
  const debat = (await demoEtat()).partie;
  assert.equal(debat.phase, 'debat');
  assert.equal(debat.temps.attente, true);
  assert.equal(debat.temps.duree, 60);
  await demoAppel('chronometre', { partieId: 'ancienne-partie', annonce: debat.temps.annonce });
  await demoAppel('chronometre', { partieId: debat.id, phase: debat.temps.phase - 1 });
  assert.equal((await demoEtat()).partie.temps.attente, true);
  await demoAppel('chronometre', { partieId: debat.id, annonce: debat.temps.annonce });
  assert.ok((await demoEtat()).partie.temps.echeance - Date.now() > 59_000);

  const ancienne = await (await appel('/api/salons', { donnees: regles })).json();
  await arreter();
  const fichierEtat = join(dossier, 'donnees', 'etat.json');
  const archive = JSON.parse(await readFile(fichierEtat, 'utf8'));
  archive.salons.find(salon => salon.code === ancienne.code).activite = Date.now() - 72 * 60 * 60_000;
  const ancienneDemo = archive.salons.find(salon => salon.code === demo.code);
  ancienneDemo.config.maire = false;
  ancienneDemo.config.debatSecondes = 0;
  ancienneDemo.partie.tour.echeance = null;
  delete ancienneDemo.partie.debutPartie;
  delete ancienneDemo.partie.tempsSuspendu;
  await writeFile(fichierEtat, JSON.stringify(archive));
  await demarrer();
  const adminRepris = await (await appel('/api/admin')).json();
  assert.ok(adminRepris.salons.some(salon => salon.code === ancienne.code));
  assert.equal(adminRepris.salons.find(salon => salon.code === hoteSalon.code).statut, 'cloturee');
  assert.deepEqual(adminRepris.compositions, [reglee]);
  const repris = await demoEtat();
  assert.equal(repris.config.maire, true);
  assert.equal(repris.partie.id, debat.id);
  assert.equal(repris.partie.phase, 'debat');
  assert.ok(repris.partie.temps.echeance - Date.now() > 59_000);
  assert.ok(Number.isFinite(repris.partie.chronoPartie.debut));
  await demoAppel('agir', { numero: repris.partie.numero, choix: null });
  const election = (await demoEtat()).partie;
  assert.equal(election.phase, 'election');
  assert.ok(election.action.cibles.length > 1);
  assert.equal((await appel(gestion + 'supprimer', { donnees: { confirme: true } })).status, 200);
  assert.equal((await appel(room + 'etat', { domaine: invite, token: sessionInvite.token, donnees: {} })).status, 404);
  const supprimes = JSON.parse(await readFile(fichierEtat, 'utf8')).salons;
  assert.ok(!supprimes.some(salon => salon.code === hoteSalon.code));
});

test('le chronomètre tient compte des pauses, du délai et des absences', () => {
  const joueurs = ['Alice', 'Bastien', 'Camille', 'Diane', 'Élie'].map(nom => ({ id: nom, nom }));
  const config = { ...verifierConfiguration(5, { villageois: 4, loups: 1 }), hote: 'Alice', cohote: 'Bastien', debatSecondes: 60, voteSecondes: 30 };
  const partie = new Partie(joueurs, config);
  const action = (id, choix = null) => partie.agir(id, partie.vue(id).numero, choix);
  for (const { id } of joueurs) action(id);
  action('Alice');
  const loup = joueurs.find(({ id }) => partie.vue(id).role === 'loups').id;
  const maintenant = Date.now();
  assert.deepEqual(partie.absents(() => false, maintenant), []);
  partie.passer(partie.absents(() => false, maintenant + 15_100));
  assert.equal(partie.vue('Alice').phase, 'debat');

  const echeance = partie.tour.echeance;
  partie.prolonger();
  assert.equal(partie.tour.echeance, echeance + 30_000);
  partie.geler('manuelle', maintenant);
  assert.equal(partie.vue('Alice').action, null);
  assert.equal(partie.actualiserTemps(echeance + 90_000), false);
  partie.reprendre(maintenant + 30_000);
  assert.equal(partie.tour.echeance, echeance + 60_000);
  assert.ok(partie.vue('Bastien').action);
  assert.equal(partie.actualiserTemps(partie.tour.echeance), true);
  assert.equal(partie.vue('Alice').phase, 'vote');
  action('Bastien', loup);
  partie.actualiserTemps(partie.tour.echeance);
  assert.equal(partie.vue('Alice').gagnant, 'village');
});

test('une partie reprend après redémarrage, avec les accès, un vote et les âges réels des phases', async t => {
  const dossier = await mkdtemp(join(tmpdir(), 'jeux-reprise-test-'));
  let serveur;
  let adresse;
  async function demarrer() {
    serveur = spawn(process.execPath, ['serveur.mjs'], { env: {
      ...process.env, JEUX_ETAT: dossier, PORT: '0', HOST: '127.0.0.1',
    } });
    const [message] = await once(serveur.stdout, 'data');
    adresse = `http://127.0.0.1:${String(message).match(/port (\d+)/)[1]}`;
  }
  async function arreter() {
    if (serveur && serveur.exitCode === null) {
      const sortie = once(serveur, 'exit');
      serveur.kill();
      await sortie;
    }
  }
  t.after(async () => { await arreter(); await rm(dossier, { force: true, recursive: true }); });
  await demarrer();

  async function post(chemin, donnees, token, code = 200) {
    const response = await fetch(adresse + '/api' + chemin, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(donnees ?? {}),
    });
    const json = await response.json();
    assert.equal(response.status, code, JSON.stringify(json));
    return json;
  }
  const hote = await post('/salons', { nom: 'Alice', total: 5, voteSecondes: 45, composition: { villageois: 4, loups: 1 } }, null, 201);
  const racine = '/salons/' + hote.code + '/';
  const clients = [hote];
  const temporaire = join(dossier, 'donnees', 'etat.json.tmp');
  await mkdir(temporaire);
  await post(racine + 'rejoindre', { nom: 'Bastien' }, null, 503);
  assert.deepEqual((await (await fetch(adresse + '/api' + racine + 'joueurs')).json()).joueurs.map(j => j.nom), ['Alice']);
  await rm(temporaire, { recursive: true });
  for (const nom of ['Bastien', 'Camille', 'Diane', 'Élie']) clients.push(await post(racine + 'rejoindre', { nom }));
  const etat = client => post(racine + 'etat', {}, client.token);
  const membre = (await etat(clients[1])).joueur;
  await post(racine + 'cohote', { joueur: membre }, hote.token);
  await post(racine + 'lancer', {}, hote.token);
  assert.equal((await etat(clients[1])).anime, true);
  await post(racine + 'pause', {}, clients[2].token, 403);
  for (const client of clients) {
    const vue = await etat(client);
    client.joueur = vue.joueur;
    client.role = vue.partie.role;
    await post(racine + 'agir', { numero: vue.partie.numero, choix: null }, client.token);
  }
  await post(racine + 'agir', { numero: (await etat(hote)).partie.numero, choix: null }, hote.token);
  const loup = clients.find(c => c.role === 'loups');
  const victime = clients.slice(2).find(c => c !== loup);
  let p = (await etat(loup)).partie;
  await post(racine + 'agir', { numero: p.numero, choix: victime.joueur }, loup.token);
  p = (await etat(clients[1])).partie;
  await post(racine + 'agir', { numero: p.numero, choix: null }, clients[1].token);
  p = (await etat(clients[1])).partie;
  await post(racine + 'agir', { numero: p.numero, choix: loup.joueur }, clients[1].token);
  await post(racine + 'pause', {}, clients[1].token);
  const avant = (await etat(hote)).partie;
  await arreter();
  await demarrer();
  const apres = (await etat(hote)).partie;
  assert.equal(apres.id, avant.id);
  assert.equal(apres.pause, 'manuelle');
  assert.deepEqual(apres.temps, avant.temps);
  assert.equal(apres.progression.reponses, 1);
  assert.equal((await etat(loup)).partie.role, 'loups');
  await post(racine + 'reprendre', {}, clients[1].token);
  assert.equal((await etat(hote)).partie.progression.reponses, 1);
  assert.equal((await etat(clients[1])).partie.aRepondu, true);

  await post('/demo', {}, undefined, 403);

});


test('les annonces nocturnes suivent les phases et restent disponibles dans l’ordre', async () => {
  const joueurs = ['Alice', 'Bastien', 'Camille', 'Diane', 'Élie'].map(nom => ({ id: nom, nom }));
  const config = verifierConfiguration(5, { villageois: 2, loups: 1, voyante: 1, sorciere: 1 });
  const partie = new Partie(joueurs, { ...config, hote: 'Alice', maire: true });
  const parRole = new Map(joueurs.map(({ id }) => [partie.vue(id).role, id]));
  const agir = (id, choix = null) => partie.agir(id, partie.vue(id).numero, choix);
  for (const { id } of joueurs) agir(id);
  agir('Alice');
  const { annonces, annonceDepuis } = partie.vue('Alice');
  assert.deepEqual(annonces.slice(annonceDepuis).map(a => a.fichier), ['le-village-sendort', 'voyante']);
  agir(parRole.get('voyante'), parRole.get('loups'));
  assert.deepEqual(partie.vue('Alice').annonces.slice(partie.vue('Alice').annonceDepuis).map(a => a.fichier), ['fin-voyante', 'loups']);
  agir(parRole.get('loups'), parRole.get('villageois'));
  agir(parRole.get('sorciere'), { soin: true, poison: null });
  const debut = partie.vue('Alice');
  assert.deepEqual(debut.annonces.slice(debut.annonceDepuis).map(a => a.fichier),
    ['fin-sorciere', 'le-village-se-reveille', 'nuit-sans-victime', 'debut-debat']);
  agir('Alice');
  partie.terminerTour();
  assert.equal(partie.annonces.at(-2).fichier, 'aucun-vote-maire');
  partie.terminerTour();
  const fichiers = await readdir(new URL('./public/audio/', import.meta.url));
  for (const { fichier } of partie.annonces) assert.ok(fichiers.includes(fichier + '.mp3'), fichier);
  assert.equal(partie.annonces.some(a => a.fichier === 'aucun-vote-elimination'), true);
});


test('la fin de l’annonce démarre le chrono partagé et le délai de secours reste borné', () => {
  const joueurs = ['Alice', 'Bastien', 'Camille', 'Diane', 'Élie'].map(nom => ({ id: nom, nom }));
  const partie = new Partie(joueurs, { ...verifierConfiguration(5, { villageois: 4, loups: 1 }),
    hote: 'Alice', narration: true, debatSecondes: 60, voteSecondes: 45 });
  partie.debat();
  const debut = partie.tour.debut;
  const annonce = partie.vue('Alice').temps.annonce;
  assert.deepEqual(partie.vue('Bastien').temps, { attente: true, duree: 60, phase: partie.tour.numero, annonce: undefined });
  assert.equal(partie.demarrerChrono(annonce - 1, debut + 5000), false);
  assert.equal(partie.actualiserTemps(debut + 85_000), false);
  partie.geler('manuelle', debut + 5000);
  assert.equal(partie.demarrerChrono(annonce, debut + 6000), false);
  assert.equal(partie.vue('Alice').chronoPartie.arrete, debut + 5000);
  partie.reprendre(debut + 9000);
  assert.equal(partie.vue('Alice').chronoPartie.suspendu, 4000);
  assert.equal(partie.demarrerChrono(annonce, debut + 10_000), true);
  assert.equal(partie.vue('Bastien').temps.echeance, debut + 70_000);
  assert.equal(partie.actualiserTemps(debut + 70_000), true);

  const ouvertureVote = partie.tour.debut;
  assert.equal(partie.vue('Bastien').temps.attente, true);
  assert.equal(partie.actualiserTemps(ouvertureVote + 89_999), false);
  assert.equal(partie.actualiserTemps(ouvertureVote + 90_000), true);
  assert.equal(partie.vue('Alice').temps.echeance, ouvertureVote + 135_000);
});
