import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Partie, verifierConfiguration } from './partie.mjs';
import { prenoms, votePasse } from './regles.mjs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const indexHtml = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8').replaceAll('__JEUX_VERSION__', version);
const acces = configurerAcces(process.env);
const executerFichier = promisify(execFile);
const audioInclus = new URL('./public/audio/', import.meta.url);
const sousTitres = JSON.parse(readFileSync(new URL('./public/annonces.json', import.meta.url), 'utf8'));
const etatLocal = process.env.JEUX_ETAT ? resolve(process.env.JEUX_ETAT) : null;
const dossierDonnees = etatLocal && resolve(etatLocal, 'donnees');
const fichierDonnees = dossierDonnees && resolve(dossierDonnees, 'etat.json');
const dossierAudio = etatLocal && resolve(etatLocal, 'audio');
const dossierMaintenance = etatLocal && resolve(etatLocal, 'maintenance');
const dossierCommandes = dossierMaintenance && resolve(dossierMaintenance, 'commandes');
const demandeMiseAJour = dossierCommandes && resolve(dossierCommandes, 'demande');
const fichierStatut = dossierMaintenance && resolve(dossierMaintenance, 'statut.json');
const nomAudio = /^[a-z0-9]+(?:-[a-z0-9]+)*\.mp3$/;
const listePrenoms = Object.values(prenoms);
const tailleMaxAudio = 8 * 1024 * 1024;
const erreurHttp = (status, message) => Object.assign(new Error(message), { status });

function configurerAcces({ JEUX_URL_HOTE, JEUX_URL_INVITES, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD }) {
  const requis = [JEUX_URL_HOTE, JEUX_URL_INVITES, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD];
  if (!requis.some(Boolean)) return null;
  if (requis.some(valeur => !valeur)) {
    throw new Error('Renseigne JEUX_URL_HOTE, JEUX_URL_INVITES, CF_ACCESS_TEAM_DOMAIN et CF_ACCESS_AUD ensemble.');
  }
  const origine = valeur => {
    const url = new URL(valeur);
    if (url.protocol !== 'https:' || url.href !== url.origin + '/') throw new Error('Indique une origine HTTPS sans chemin ni paramètres.');
    return url;
  };
  const hote = origine(JEUX_URL_HOTE);
  const invites = origine(JEUX_URL_INVITES);
  const equipe = origine(CF_ACCESS_TEAM_DOMAIN);
  if (hote.host === invites.host || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(equipe.host)) {
    throw new Error('Utilise deux domaines distincts et une URL d’équipe Cloudflare Access valide.');
  }
  const cles = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', equipe), { timeoutDuration: 4500 });
  return { hote, invites, equipe, aud: CF_ACCESS_AUD, cles };
}

async function modeAcces(req) {
  if (!acces) return 'local';
  const domaine = req.headers.host?.toLowerCase();
  const hote = domaine === acces.hote.host;
  if (!hote && domaine !== acces.invites.host) return null;
  const origine = hote ? acces.hote.origin : acces.invites.origin;
  if (['POST', 'PUT'].includes(req.method)) {
    const type = req.headers['content-type'] ?? '';
    const typeAttendu = req.method === 'POST' ? /^application\/json(?:;|$)/i : /^(audio\/mpeg|application\/octet-stream)(?:;|$)/i;
    if ((req.headers.origin && req.headers.origin !== origine) || !typeAttendu.test(type)) {
      throw erreurHttp(403, 'Origine ou format de requête invalide.');
    }
  }
  if (!hote) return 'invite';
  const assertion = req.headers['cf-access-jwt-assertion'];
  if (typeof assertion !== 'string') throw Object.assign(new Error('Connecte-toi via Cloudflare Access avec le lien hôte.'), { status: 403 });
  try {
    await jwtVerify(assertion, acces.cles, {
      issuer: acces.equipe.origin, audience: acces.aud, algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat'],
    });
  } catch {
    throw Object.assign(new Error('La session Cloudflare Access est invalide ou expirée.'), { status: 403 });
  }
  return 'hote';
}

const salons = new Map();
const presenceValide = 15_000;
const dureeDebatDemo = 60;
const dureeRoleDefaut = 60;
const dureeReprise = 10 * 60_000;
const annoncesDisponibles = (await readdir(audioInclus))
  .filter(nom => nomAudio.test(nom)).sort().map(nom => nom.slice(0, -4));
let son = { associations: {}, volume: 100 };
let compositions = [];
let dernierEnregistrement = Date.now();

function sauvegarder() {
  if (!fichierDonnees) return;
  const date = Date.now();
  const donnees = [...salons.values()].map(({ sessions, demandes, presence, partie, ...salon }) => ({
    ...salon, sessions: [...sessions], demandes: [...demandes], partie: partie?.sauvegarde() ?? null,
  }));
  const temporaire = `${fichierDonnees}.tmp`;
  try {
    writeFileSync(temporaire, JSON.stringify({ version: 1, date, salons: donnees, son, compositions }), { mode: 0o600, flush: true });
    renameSync(temporaire, fichierDonnees);
    dernierEnregistrement = date;
  } catch (incident) {
    try { rmSync(temporaire, { force: true }); } catch {}
    console.error('Échec de sauvegarde :', incident.code);
    throw erreurHttp(503, 'Le serveur ne parvient pas à sauvegarder les parties.');
  }
}

function charger() {
  if (!fichierDonnees) return;
  mkdirSync(dossierDonnees, { recursive: true, mode: 0o700 });
  let contenu;
  try { contenu = readFileSync(fichierDonnees, 'utf8'); }
  catch (incident) { if (incident.code === 'ENOENT') return; throw incident; }
  const archive = JSON.parse(contenu);
  if (archive.version !== 1 || !Array.isArray(archive.salons)) throw new Error('Version de sauvegarde Jeux inconnue.');
  son = archive.son ?? son;
  compositions = archive.compositions ?? compositions;
  for (const { sessions, demandes, partie, ...entree } of archive.salons) {
    entree.config.narration = false;
    entree.config.roleSecondes ??= dureeRoleDefaut;
    if (entree.demo) {
      entree.config.maire = true;
      if (!entree.config.debatSecondes) entree.config.debatSecondes = dureeDebatDemo;
    }
    const salon = { ...entree, presence: new Map(), sessions: new Map(sessions), demandes: new Map(demandes),
      partie: partie ? Partie.charger(partie, entree.joueurs, entree.config) : null };
    if (entree.demo && salon.partie?.tour.type === 'debat' && !partie.tour.echeance && !partie.tour.preparation) {
      salon.partie.tour.echeance = (partie.pauseDepuis ?? archive.date) + dureeDebatDemo * 1000;
    }
    salon.partie?.geler('absence', archive.date);
    salons.set(salon.code, salon);
  }
}

const estBot = (salon, id) => salon.bots?.includes(id) === true;

function enLigne(salon, id, maintenant = Date.now()) {
  return estBot(salon, id) || maintenant - (salon.presence.get(id) ?? 0) < presenceValide;
}

function choixDuBot(salon, bot, type, cibles) {
  if (type === 'voyante' && salon.partie.tour.revelationAttendue) return 'confirmer';
  if (type === 'sorciere') return { soin: false, poison: null };
  if (type === 'loups') {
    const choixHumain = [...salon.partie.tour.reponses].find(([id, cible]) => !estBot(salon, id) && cible != null)?.[1];
    if (choixHumain) return choixHumain;
  }
  if (type === 'cupidon') return [...cibles.filter(id => estBot(salon, id)),
    ...cibles.filter(id => !estBot(salon, id))].slice(0, 2);
  return cibles.find(id => id !== bot && estBot(salon, id))
    ?? cibles.find(id => id !== bot && id !== salon.config.hote) ?? cibles.find(id => id !== bot) ?? cibles[0] ?? null;
}

function actualiserPartie(salon, maintenant = Date.now()) {
  const partie = salon.partie;
  if (salon.cloture || !partie || (partie.gagnant && !partie.tour.preparation)) return false;
  if (!enLigne(salon, salon.config.hote, maintenant)) salon.config.narration = false;
  if (![...salon.presence.values()].some(date => maintenant - date < presenceValide)) {
    return partie.geler('absence', maintenant);
  }
  const sonRequis = salon.config.narrationObligatoire && !['distribution', 'lancement'].includes(partie.tour.type);
  if (sonRequis && partie.pause !== 'manuelle') {
    if (!partie.pause && partie.tour.preparation?.limite <= maintenant) salon.config.narration = false;
    if (!salon.config.narration) return partie.geler('son', maintenant);
  }
  let change = ['absence', 'son'].includes(partie.pause) && partie.reprendre(maintenant);
  if (partie.pause) return change;
  if (!salon.config.narration && partie.demarrerChrono(null, maintenant)) change = true;
  if (partie.actualiserTemps(maintenant)) change = true;
  if (salon.bots?.length) {
    for (let i = 0; i < 64 && !partie.gagnant; i++) {
      if (partie.tour.preparation) break;
      const { acteurs, cibles, type, numero, reponses } = partie.tour;
      const choixHumain = type === 'loups'
        ? [...reponses].find(([id, cible]) => !estBot(salon, id) && cible != null)?.[1] : undefined;
      const bot = acteurs.find(id => estBot(salon, id) &&
        (!reponses.has(id) || (choixHumain !== undefined && reponses.get(id) !== choixHumain)));
      if (!bot) break;
      let choix;
      if (partie.peutPasserVote()) {
        const humains = acteurs.filter(id => !estBot(salon, id));
        const voixPourPasser = humains.filter(id => reponses.get(id) === votePasse).length;
        const enAttente = humains.filter(id => !reponses.has(id)).length;
        if (voixPourPasser > humains.length / 2) choix = votePasse;
        else if (voixPourPasser + enAttente > humains.length / 2) break;
      }
      partie.agir(bot, numero, choix ?? choixDuBot(salon, bot, type, cibles));
      change = true;
    }
  }
  return change;
}

charger();
setInterval(() => {
  try {
    const maintenant = Date.now();
    let change = false;
    for (const salon of salons.values()) if (actualiserPartie(salon, maintenant)) change = true;
    if (change || (maintenant - dernierEnregistrement >= 30_000 &&
        [...salons.values()].some(salon => salon.activite > dernierEnregistrement))) sauvegarder();
  } catch (incident) { console.error(incident.message); }
}, 1000).unref();

function pointer(salon, id) {
  salon.activite = Date.now();
  salon.presence.set(id, salon.activite);
}

function resume(salon, id) {
  const enLigneNombre = salon.cloture ? 0 : salon.joueurs.filter(j => enLigne(salon, j.id)).length;
  const statut = salon.cloture ? 'cloturee' : salon.partie?.gagnant ? 'terminee'
    : salon.partie?.pause || enLigneNombre === 0 ? 'pause'
    : salon.partie ? 'en-cours' : 'ouvert';
  return {
    code: salon.code, statut, demo: salon.demo, activite: salon.activite, enLigne: enLigneNombre,
    joueurs: salon.joueurs.length, total: salon.total, jour: salon.partie?.jour ?? 0,
    nom: salon.joueurs.find(j => j.id === id)?.nom,
  };
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const jeton = () => randomBytes(32).toString('base64url');

function session(salon, joueur, connecter = true) {
  const token = jeton();
  salon.sessions.set(token, joueur.id);
  if (connecter) pointer(salon, joueur.id);
  return token;
}

function ajouter(salon, nom) {
  if (typeof nom !== 'string' || !nom.trim() || nom.trim().length > 24) {
    throw new Error('Saisis un pseudo de 1 à 24 caractères.');
  }
  const propre = nom.trim();
  if (salon.joueurs.some(j => j.nom.toLowerCase() === propre.toLowerCase())) {
    throw new Error('Ce prénom est déjà utilisé dans le salon.');
  }
  const joueur = { id: randomUUID(), nom: propre };
  salon.joueurs.push(joueur);
  return joueur;
}

function identiteJoueur(data, listeImposee = false) {
  if (!listeImposee && !Object.hasOwn(data, 'prenom')) return data.nom;
  const valeur = data.prenom ?? data.nom;
  const prenom = typeof valeur === 'string' ? valeur.normalize('NFC') : '';
  if (!listePrenoms.includes(prenom)) throw erreurHttp(400, 'Choisis un prénom dans la liste.');
  return prenom;
}

function modifierBots(salon, action, id) {
  if (salon.partie) throw erreurHttp(409, 'Les bots se règlent avant le tirage des cartes.');
  const joueurs = salon.joueurs.slice();
  const bots = salon.bots ?? [];
  if (action === 'ajouterbot') {
    if (joueurs.length >= salon.total) throw erreurHttp(409, 'Le salon est complet.');
    let numero = 1;
    while (joueurs.some(joueur => joueur.nom.toLowerCase() === `bot ${numero}`)) numero++;
    salon.bots = [...bots, ajouter(salon, `Bot ${numero}`).id];
  } else {
    if (!estBot(salon, id)) throw erreurHttp(404, 'Ce bot n’existe plus.');
    salon.joueurs = joueurs.filter(joueur => joueur.id !== id);
    salon.bots = bots.filter(bot => bot !== id);
  }
  try { sauvegarder(); }
  catch (incident) { salon.joueurs = joueurs; salon.bots = bots; throw incident; }
}

function duree(valeur = 0) {
  if (!Number.isInteger(valeur) || (valeur !== 0 && (valeur < 15 || valeur > 900))) {
    throw new Error('Indique entre 0,25 et 15 minutes, ou 0 pour désactiver le chronomètre.');
  }
  return valeur;
}

function reglagePartie(data) {
  const regles = verifierConfiguration(data.total, data.composition, data.ordre);
  return { ...regles, maire: data.maire === true, discret: data.discret === true,
    debatSecondes: duree(data.debatSecondes ?? 120), voteSecondes: duree(data.voteSecondes ?? 60),
    roleSecondes: duree(data.roleSecondes ?? dureeRoleDefaut) };
}

function creer(data, demo = false) {
  if (salons.size >= 500) throw erreurHttp(503, 'Le serveur a atteint sa capacité. Supprime des salons depuis Administration.');
  const config = reglagePartie(data);
  if (Object.hasOwn(data, 'prenom')) config.annoncesEliminations = true;
  let code;
  do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (salons.has(code));
  const salon = {
    code, total: data.total, joueurs: [], sessions: new Map(), demandes: new Map(), partie: null,
    presence: new Map(), activite: Date.now(), prochainNumero: 0, config, demo,
  };
  const hote = ajouter(salon, identiteJoueur(data));
  salon.config.hote = hote.id;
  const cle = session(salon, hote);
  if (demo) {
    salon.bots = ['Alice (bot)', 'Camille (bot)', 'Sam (bot)', 'Lou (bot)'].map(nom => ajouter(salon, nom).id);
    config.narrationObligatoire = true;
    salon.partie = new Partie(salon.joueurs, config, 0);
    const voyante = salon.joueurs.find(({ id }) => salon.partie.cartes.get(id) === 'voyante').id;
    salon.partie.cartes.set(voyante, salon.partie.cartes.get(hote.id));
    salon.partie.cartes.set(hote.id, 'voyante');
    actualiserPartie(salon);
  }
  salons.set(code, salon);
  try { sauvegarder(); }
  catch (incident) { salons.delete(code); throw incident; }
  return { code, token: cle };
}

function animateur(salon, id) {
  return id === salon.config.hote || id === salon.config.cohote;
}

function passerDisponibles(salon) {
  if (!salon.partie || ['distribution', 'lancement', 'debat', 'attenteNuit', 'egaliteElection', 'egaliteVote'].includes(salon.partie.tour.type)) return [];
  return salon.partie.absents(id => enLigne(salon, id));
}

function vue(salon, joueur) {
  const hote = joueur === salon.config.hote;
  const anime = animateur(salon, joueur);
  const partie = salon.cloture ? null : salon.partie?.vue(joueur);
  if (partie && anime) partie.peutPasser = passerDisponibles(salon).length > 0;
  if (partie?.annonceLue) partie.sousTitre = partie.messageEliminationLue ?? sousTitres[partie.annonceLue];
  return {
    code: salon.code, version, total: salon.total, joueur, hote, anime, hoteId: salon.config.hote, cohoteId: salon.config.cohote,
    demo: salon.demo, horloge: Date.now(), son,
    joueurs: salon.joueurs.map(j => ({ ...j, bot: estBot(salon, j.id), enLigne: !salon.cloture && enLigne(salon, j.id) })),
    resume: resume(salon, joueur),
    config: { composition: salon.config.composition, ordre: salon.config.ordre, maire: salon.config.maire, discret: salon.config.discret },
    partie: partie ?? null,
    demandes: hote && !salon.cloture ? [...salon.demandes.values()].filter(d => d.statut === 'attente' && Date.now() - d.date <= dureeReprise).map(({ id, joueur }) => ({
      id, nom: salon.joueurs.find(j => j.id === joueur).nom,
    })) : [],
  };
}

function gerer(salon, action, data, token, mode) {
  if (salon.demo && (mode !== 'hote' || !salon.sessions.has(token))) throw erreurHttp(404, 'Cette démo est réservée à son administrateur.');
  if (!salon.demo && mode === 'invite' && (salon.sessions.get(token) === salon.config.hote ||
      (action === 'recuperer' && data.joueur === salon.config.hote))) {
    throw Object.assign(new Error('Cette place doit être ouverte avec le lien hôte.'), { status: 403 });
  }
  if (mode === 'hote' && action === 'rejoindre') {
    throw Object.assign(new Error('Rejoins la partie avec le lien d’invitation.'), { status: 403 });
  }
  if (salon.cloture && !['apercu', 'etat', 'absence'].includes(action)) {
    throw erreurHttp(410, 'Cette partie a été terminée par l’administration.');
  }
  if (action === 'rejoindre') {
    if (salon.partie || salon.joueurs.length >= salon.total) throw new Error('Ce salon est complet ou la partie a commencé.');
    const activite = salon.activite;
    const nouveau = ajouter(salon, identiteJoueur(data, salon.config.annoncesEliminations));
    const cle = session(salon, nouveau);
    try { sauvegarder(); }
    catch (incident) {
      salon.joueurs.pop();
      salon.sessions.delete(cle);
      salon.presence.delete(nouveau.id);
      salon.activite = activite;
      throw incident;
    }
    return { code: salon.code, token: cle };
  }
  if (action === 'recuperer') {
    if (estBot(salon, data.joueur) || !salon.joueurs.some(j => j.id === data.joueur)) throw new Error('Cette place n’existe plus.');
    const maintenant = Date.now();
    for (const [secret, demande] of salon.demandes) {
      if (maintenant - demande.date > dureeReprise) salon.demandes.delete(secret);
    }
    if (salon.demandes.size >= 40) throw new Error('Trop de demandes de reprise. Réessaie plus tard.');
    const secret = jeton();
    salon.demandes.set(secret, { id: randomUUID(), joueur: data.joueur, statut: 'attente', date: maintenant });
    sauvegarder();
    return { secret };
  }
  if (action === 'reprise') {
    const demande = salon.demandes.get(token);
    if (!demande || Date.now() - demande.date > dureeReprise) throw new Error('La demande a expiré.');
    if (mode === 'invite' && demande.joueur === salon.config.hote) {
      throw Object.assign(new Error('Cette place doit être ouverte avec le lien hôte.'), { status: 403 });
    }
    return { statut: demande.statut, token: demande.token };
  }
  const joueur = salon.sessions.get(token);
  if (!joueur) throw Object.assign(new Error('Session expirée. Demande à reprendre ta place.'), { status: 401 });
  if (action === 'apercu') return resume(salon, joueur);
  if (salon.cloture) return action === 'etat' ? vue(salon, joueur) : resume(salon, joueur);
  if (action === 'absence') {
    salon.presence.delete(joueur);
    if (joueur === salon.config.hote) salon.config.narration = false;
    if (actualiserPartie(salon)) sauvegarder();
    return resume(salon, joueur);
  }
  pointer(salon, joueur);
  if (actualiserPartie(salon)) sauvegarder();
  if (action === 'etat') return vue(salon, joueur);
  if (action === 'agir') {
    if (!salon.partie) throw new Error('La partie n’a pas commencé.');
    const precedent = fichierDonnees && structuredClone(salon.partie.sauvegarde());
    try {
      salon.partie.agir(joueur, data.numero, data.choix);
      actualiserPartie(salon);
      sauvegarder();
    } catch (incident) {
      if (precedent) salon.partie = Partie.charger(precedent, salon.joueurs, salon.config);
      throw incident;
    }
    return vue(salon, joueur);
  }
  if (action === 'narration') {
    if (joueur !== salon.config.hote) throw erreurHttp(403, 'La narration utilise le téléphone de l’hôte.');
    salon.config.narration = data.active === true;
    const partie = salon.partie;
    if (data.active === true && partie?.pause === 'son' && partie.tour.preparation) {
      partie.tour.preparation.limite = Date.now() + 90_000;
    }
    if (actualiserPartie(salon)) sauvegarder();
    return { active: salon.config.narration };
  }
  if (action === 'chronometre') {
    if (!animateur(salon, joueur)) throw erreurHttp(403, 'Action réservée à l’animateur du salon.');
    if (data.annonce !== undefined && joueur !== salon.config.hote) {
      throw erreurHttp(403, 'La narration utilise le téléphone de l’hôte.');
    }
    const partie = salon.partie;
    if (partie && partie.id === data.partieId) {
      if (data.lecture === true) {
        if (salon.config.narration && joueur === salon.config.hote) partie.suivreAnnonce(data.annonce);
      } else if ((Number.isInteger(data.annonce) || (!salon.config.narrationObligatoire && data.phase === partie.tour.numero)) &&
        partie.demarrerChrono(data.annonce)) {
        actualiserPartie(salon);
        sauvegarder();
      }
    }
    return { ok: true };
  }
  if (['pause', 'reprendre', 'passer', 'prolonger'].includes(action)) {
    if (!animateur(salon, joueur)) throw erreurHttp(403, 'Action réservée à l’animateur du salon.');
    if (!salon.partie || salon.partie.gagnant) throw new Error('La partie est terminée ou n’a pas commencé.');
    if (action === 'pause') salon.partie.geler('manuelle');
    if (action === 'reprendre') {
      if (salon.partie.pause === 'son') throw erreurHttp(409, 'L’hôte doit réactiver le son.');
      salon.partie.reprendre();
    }
    if (action === 'passer') salon.partie.passer(passerDisponibles(salon));
    if (action === 'prolonger') salon.partie.prolonger();
    actualiserPartie(salon);
    sauvegarder();
    return vue(salon, joueur);
  }
  if (joueur !== salon.config.hote) throw Object.assign(new Error('Cette action est réservée à l’hôte.'), { status: 403 });
  if (['ajouterbot', 'retirerbot'].includes(action)) {
    modifierBots(salon, action, data.joueur);
    return vue(salon, joueur);
  }
  if (action === 'cohote') {
    const id = data.joueur;
    if (id !== null && (id === salon.config.hote || estBot(salon, id) || !salon.joueurs.some(j => j.id === id))) {
      throw new Error('Choisis un invité du salon.');
    }
    if (salon.demo) throw new Error('La démo se joue en solo.');
    if (salon.partie) salon.partie.changerCohote(id);
    else salon.config.cohote = id;
  } else if (action === 'decision') {
    const demande = [...salon.demandes.values()].find(d => d.id === data.id && d.statut === 'attente' && Date.now() - d.date <= dureeReprise);
    if (!demande) throw new Error('Cette demande a expiré.');
    demande.statut = data.accepte === true ? 'acceptee' : 'refusee';
    if (demande.statut === 'acceptee') {
      for (const [cle, place] of salon.sessions) if (place === demande.joueur) salon.sessions.delete(cle);
      salon.presence.delete(demande.joueur);
      for (const autre of salon.demandes.values()) {
        if (autre !== demande && autre.joueur === demande.joueur && autre.statut === 'attente') autre.statut = 'refusee';
      }
      demande.token = session(salon, { id: demande.joueur }, false);
    }
  } else if (action === 'lancer') {
    if (salon.partie || salon.joueurs.length !== salon.total) throw new Error('Toutes les places doivent être occupées.');
    if (!salon.joueurs.every(j => enLigne(salon, j.id))) throw new Error('Attends que tous les joueurs soient de retour.');
    salon.config.narrationObligatoire = true;
    salon.partie = new Partie(salon.joueurs, salon.config, salon.prochainNumero);
    actualiserPartie(salon);
  } else if (action === 'retour') {
    if (salon.partie?.tour.type !== 'fin' || salon.partie.tour.preparation) throw new Error('Attends la fin de la partie.');
    salon.prochainNumero = salon.partie.numero;
    if (salon.demo) {
      salon.partie = new Partie(salon.joueurs, salon.config, salon.prochainNumero);
      const voyante = salon.joueurs.find(({ id }) => salon.partie.cartes.get(id) === 'voyante').id;
      salon.partie.cartes.set(voyante, salon.partie.cartes.get(joueur));
      salon.partie.cartes.set(joueur, 'voyante');
      actualiserPartie(salon);
    } else salon.partie = null;
  } else throw Object.assign(new Error('Action inconnue.'), { status: 404 });
  sauvegarder();
  return vue(salon, joueur);
}

async function statutMaintenance() {
  if (!dossierCommandes || !(await stat(dossierCommandes).catch(() => null))?.isDirectory()) return { actif: false };
  const precedent = await readFile(fichierStatut, 'utf8').then(JSON.parse).catch(() => ({}));
  const demande = Boolean(await stat(demandeMiseAJour).catch(() => null));
  return { ...precedent, actif: true, statut: demande && precedent.statut !== 'en-cours' ? 'en-attente' : precedent.statut ?? 'pret' };
}

async function planifierMiseAJour(confirme) {
  if (!confirme) throw erreurHttp(400, 'Confirme le redémarrage avant de lancer la mise à jour.');
  const maintenance = await statutMaintenance();
  if (!maintenance.actif) throw erreurHttp(503, 'Le service de mise à jour n’est pas installé dans ce conteneur.');
  if (['en-attente', 'en-cours'].includes(maintenance.statut)) throw erreurHttp(409, 'Une mise à jour est déjà en cours.');
  try { await writeFile(demandeMiseAJour, '', { flag: 'wx', mode: 0o600 }); }
  catch (incident) {
    if (incident.code === 'EEXIST') throw erreurHttp(409, 'Une mise à jour est déjà en cours.');
    throw erreurHttp(503, 'Impossible de transmettre la demande au service système.');
  }
  return { ...maintenance, statut: 'en-attente' };
}

async function audiosAdmin() {
  const inclus = await readdir(audioInclus);
  const personnalises = dossierAudio ? await readdir(dossierAudio).catch(() => []) : [];
  return [...new Set([...inclus, ...personnalises])].filter(nom => nomAudio.test(nom)).sort()
    .map(nom => ({ nom, fourni: inclus.includes(nom), personnalise: personnalises.includes(nom) }));
}

async function enregistrerAudio(req, nom) {
  if (!dossierAudio) throw erreurHttp(503, 'Le dossier des audios personnalisés est indisponible.');
  if (!nomAudio.test(nom) || nom.length > 80) throw erreurHttp(400, 'Utilise un nom MP3 en minuscules, avec des tirets.');
  if (Number(req.headers['content-length']) > tailleMaxAudio) throw erreurHttp(413, 'Le fichier doit faire au plus 8 Mio.');
  const morceaux = [];
  let taille = 0;
  for await (const morceau of req.iterator({ destroyOnReturn: false })) {
    taille += morceau.length;
    if (taille > tailleMaxAudio) {
      req.resume();
      throw erreurHttp(413, 'Le fichier doit faire au plus 8 Mio.');
    }
    morceaux.push(morceau);
  }
  if (!taille) throw erreurHttp(400, 'Sélectionne un fichier MP3.');
  const temporaire = await mkdtemp(resolve(dossierAudio, '.import-'));
  try {
    const chemin = resolve(temporaire, 'annonce.mp3');
    await writeFile(chemin, Buffer.concat(morceaux), { mode: 0o600 });
    try {
      await executerFichier('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-f', 'mp3', '-i', chemin,
        '-map', '0:a:0', '-f', 'null', '-'], { timeout: 12_000, maxBuffer: 32_768 });
    } catch {
      throw erreurHttp(422, 'Le fichier est illisible ou n’est pas un MP3 valide.');
    }
    await rename(chemin, resolve(dossierAudio, nom));
  } finally { await rm(temporaire, { recursive: true, force: true }); }
  return { nom };
}

function modifierSalon(code, action, data) {
  const salon = salons.get(code);
  if (!salon) throw erreurHttp(404, 'Ce salon n’existe plus.');
  if (data.confirme !== true) throw erreurHttp(400, 'Confirme cette action.');
  if (action === 'terminer') {
    if (salon.cloture) return;
    salon.cloture = Date.now();
    try { sauvegarder(); }
    catch (incident) { delete salon.cloture; throw incident; }
  } else {
    salons.delete(code);
    try { sauvegarder(); }
    catch (incident) { salons.set(code, salon); throw incident; }
  }
}

function enregistrerComposition(data) {
  const nom = typeof data.nom === 'string' ? data.nom.trim() : '';
  if (!nom || nom.length > 35) throw erreurHttp(400, 'Saisis un nom de 1 à 35 caractères.');
  const ancienne = data.id === undefined ? null : compositions.find(composition => composition.id === data.id);
  if (data.id !== undefined && !ancienne) throw erreurHttp(404, 'Cette composition n’existe plus.');
  if (compositions.some(composition => composition !== ancienne && composition.nom.toLowerCase() === nom.toLowerCase())) {
    throw erreurHttp(409, 'Ce nom de composition est déjà utilisé.');
  }
  const nouvelle = { id: ancienne?.id ?? randomUUID(), nom, total: data.total, ...reglagePartie(data) };
  const avant = compositions;
  compositions = ancienne ? compositions.map(composition => composition === ancienne ? nouvelle : composition) : [...compositions, nouvelle];
  try { sauvegarder(); }
  catch (incident) { compositions = avant; throw incident; }
  return { composition: nouvelle, compositions };
}

async function admin(req, res, chemin, mode) {
  if (mode !== 'hote') throw erreurHttp(403, 'Ce panneau est réservé au lien hôte protégé par Cloudflare Access.');
  if (req.method === 'GET' && chemin === '/api/admin') {
    const liste = [...salons.values()].map(salon => {
      const { nom, ...infos } = resume(salon, salon.config.hote);
      return { ...infos, hote: nom };
    }).sort((a, b) => b.activite - a.activite);
    return json(res, 200, { salons: liste, compositions, audios: await audiosAdmin(), stockageAudio: Boolean(dossierAudio), version, son, annonces: annoncesDisponibles, maintenance: await statutMaintenance() });
  }
  const gestion = chemin.match(/^\/api\/admin\/salons\/([A-HJ-NP-Z2-9]{6})\/(terminer|supprimer)$/);
  if (req.method === 'POST' && gestion) {
    modifierSalon(gestion[1], gestion[2], await lire(req));
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && chemin === '/api/admin/compositions') {
    return json(res, 200, enregistrerComposition(await lire(req)));
  }
  if (req.method === 'POST' && chemin === '/api/admin/son') {
    const { evenement, fichier, volume } = await lire(req);
    if (!Number.isInteger(volume) || volume < 0 || volume > 100 ||
        !annoncesDisponibles.includes(evenement) ||
        (fichier !== '' && !(await audiosAdmin()).some(audio => audio.nom === fichier))) {
      throw erreurHttp(400, 'Sélectionne une annonce, un MP3 disponible et un volume entre 0 et 100.');
    }
    const associations = { ...son.associations };
    if (fichier) associations[evenement] = fichier;
    else delete associations[evenement];
    son = { volume, associations };
    sauvegarder();
    return json(res, 200, son);
  }
  if (req.method === 'POST' && chemin === '/api/admin/miseajour') {
    return json(res, 202, await planifierMiseAJour((await lire(req)).confirme === true));
  }
  const fichier = chemin.match(/^\/api\/admin\/audio\/([a-z0-9-]+\.mp3)$/);
  if (req.method === 'PUT' && fichier) return json(res, 200, await enregistrerAudio(req, fichier[1]));
  return json(res, 404, { erreur: 'Action inconnue.' });
}

async function lire(req) {
  let texte = '';
  for await (const morceau of req.setEncoding('utf8')) {
    texte += morceau;
    if (texte.length > 8192) throw Object.assign(new Error('Requête trop grande.'), { status: 413 });
  }
  const data = texte ? JSON.parse(texte) : {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Requête invalide.');
  return data;
}

function json(res, status, objet) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(objet));
}

const formats = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2', mp3: 'audio/mpeg' };

const serveur = createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    const chemin = url.pathname;
    if (req.method === 'GET' && chemin === '/sante' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return json(res, 200, { ok: true, version });
    }
    const mode = await modeAcces(req);
    if (!mode) return json(res, 421, { erreur: 'Utilise le lien hôte ou le lien d’invitation.' });
    if (chemin === '/api/admin' || chemin.startsWith('/api/admin/')) return await admin(req, res, chemin, mode);
    if (req.method === 'GET' && chemin === '/api/configuration') {
      return json(res, 200, { mode, version, origineInvites: acces?.invites.origin, son, prenoms: listePrenoms, ...(mode === 'hote' && { compositions }) });
    }
    if (req.method === 'POST' && chemin === '/api/demo') {
      if (mode !== 'hote') throw erreurHttp(403, 'La démo est réservée à l’administration.');
      await lire(req);
      return json(res, 201, creer({ nom: 'Toi', total: 5,
        composition: { villageois: 2, loups: 1, voyante: 1, sorciere: 1 }, maire: true, debatSecondes: dureeDebatDemo, voteSecondes: 45 }, true));
    }
    if (req.method === 'POST' && chemin === '/api/salons') {
      if (mode === 'invite') return json(res, 403, { erreur: 'Seul le lien hôte permet de créer un salon.' });
      return json(res, 201, creer(await lire(req)));
    }
    const route = chemin.match(/^\/api\/salons\/([A-Z2-9]{6})\/([a-z]+)$/);
    if (route) {
      const [, code, action] = route;
      const salon = salons.get(code);
      if (!salon) throw erreurHttp(404, 'Ce salon n’existe plus.');
      if (salon.demo && req.method === 'GET') return json(res, 404, { erreur: 'Cette démo est privée.' });
      if (salon.cloture && req.method === 'GET') throw erreurHttp(410, 'Cette partie a été terminée par l’administration.');
      if (req.method === 'GET' && action === 'joueurs') {
        const joueurs = salon.joueurs.filter(j => !estBot(salon, j.id) && (mode !== 'invite' || j.id !== salon.config.hote));
        return json(res, 200, { joueurs });
      }
      if (req.method === 'GET' && action === 'qr') {
        const invitation = new URL(url.searchParams.get('url'));
        if (!['http:', 'https:'].includes(invitation.protocol) || invitation.pathname !== '/' ||
            invitation.search !== `?salon=${code}` || invitation.hash || invitation.username ||
            invitation.password || invitation.href.length > 250 || (acces && invitation.origin !== acces.invites.origin)) throw new Error('Lien d’invitation invalide.');
        const png = await QRCode.toBuffer(invitation.href, { width: 240, margin: 2 });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        return res.end(png);
      }
      if (req.method !== 'POST') return json(res, 405, { erreur: 'Méthode invalide.' });
      const data = await lire(req);
      if (salons.get(code) !== salon) throw erreurHttp(404, 'Ce salon n’existe plus.');
      return json(res, 200, gerer(salon, action, data, req.headers.authorization?.replace(/^Bearer /, ''), mode));
    }
    const fichier = chemin === '/' ? '/index.html' : chemin;
    if (!['GET', 'HEAD'].includes(req.method) ||
        !/^\/(?:index\.html|(?:style|encre|polices)\.css|app\.js|icones\.svg|polices\/[a-z0-9-]+\.woff2|illustrations\/(?:roles\/)?[a-z-]+\.png|loup-garou\/roles\/[a-z-]+\.mjs|audio\/[a-z0-9-]+\.mp3)$/.test(fichier)) {
      return json(res, 404, { erreur: 'Page introuvable.' });
    }
    if (fichier === '/index.html') {
      res.writeHead(200, { 'Content-Type': formats.html, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(indexHtml) });
      return res.end(req.method === 'GET' ? indexHtml : undefined);
    }
    let local = new URL(`./public${fichier}`, import.meta.url);
    let infos;
    if (dossierAudio && fichier.startsWith('/audio/')) {
      const remplacement = resolve(dossierAudio, fichier.slice('/audio/'.length));
      infos = await stat(remplacement).catch(() => null);
      if (infos?.isFile()) local = remplacement;
    }
    if (typeof local !== 'string') infos = await stat(local).catch(() => null);
    if (!infos?.isFile()) return json(res, 404, { erreur: 'Fichier introuvable.' });
    const extension = fichier.split('.').at(-1);
    const entetes = { 'Content-Type': formats[extension], 'Cache-Control': 'no-cache' };
    let debut = 0;
    let fin = infos.size - 1;
    let status = 200;
    if (extension === 'mp3') {
      entetes['Accept-Ranges'] = 'bytes';
      if (req.headers.range) {
        const plage = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (plage?.[1]) {
          debut = Number(plage[1]);
          if (plage[2]) fin = Math.min(Number(plage[2]), fin);
        } else if (plage?.[2]) {
          debut = Math.max(0, infos.size - Number(plage[2]));
        }
        if (!plage || (!plage[1] && !plage[2]) || debut > fin) {
          res.writeHead(416, { ...entetes, 'Content-Range': `bytes */${infos.size}` });
          return res.end();
        }
        entetes['Content-Range'] = `bytes ${debut}-${fin}/${infos.size}`;
        status = 206;
      }
    }
    res.writeHead(status, { ...entetes, 'Content-Length': fin - debut + 1 });
    if (req.method === 'HEAD') return res.end();
    createReadStream(local, { start: debut, end: fin }).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (!res.headersSent) json(res, error.status ?? 400, { erreur: error.message });
    else res.destroy();
  }
});

serveur.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => {
  console.log(`Jeux écoute sur le port ${serveur.address().port}.`);
});


process.once('SIGTERM', () => {
  try { sauvegarder(); }
  catch { process.exitCode = 1; }
  serveur.close();
});
