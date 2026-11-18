import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import QRCode from 'qrcode';
import { Partie, verifierConfiguration } from './partie.mjs';

const salons = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const jeton = () => randomBytes(32).toString('base64url');

function session(salon, joueur) {
  const token = jeton();
  salon.sessions.set(token, joueur.id);
  return token;
}

function ajouter(salon, nom) {
  if (typeof nom !== 'string' || !nom.trim() || nom.trim().length > 24) {
    throw new Error('Saisis un pseudo de 1 à 24 caractères.');
  }
  const propre = nom.trim();
  if (salon.joueurs.some(j => j.nom.toLowerCase() === propre.toLowerCase())) {
    throw new Error('Ce pseudo est déjà utilisé.');
  }
  const joueur = { id: randomUUID(), nom: propre };
  salon.joueurs.push(joueur);
  return joueur;
}

function creer(data) {
  const regles = verifierConfiguration(data.total, data.composition, data.ordre);
  let code;
  do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (salons.has(code));
  const salon = {
    code, total: data.total, joueurs: [], sessions: new Map(), demandes: new Map(), partie: null,
    config: { ...regles, maire: data.maire === true, discret: data.discret === true },
  };
  const hote = ajouter(salon, data.nom);
  salon.config.hote = hote.id;
  salons.set(code, salon);
  return { code, token: session(salon, hote) };
}

function vue(salon, joueur) {
  const hote = joueur === salon.config.hote;
  return {
    code: salon.code, total: salon.total, joueurs: salon.joueurs, joueur, hote,
    config: { composition: salon.config.composition, ordre: salon.config.ordre, maire: salon.config.maire },
    partie: salon.partie?.vue(joueur) ?? null,
    demandes: hote ? [...salon.demandes.values()].filter(d => d.statut === 'attente').map(({ id, joueur }) => ({
      id, nom: salon.joueurs.find(j => j.id === joueur).nom,
    })) : [],
  };
}

function gerer(salon, action, data, token) {
  if (action === 'rejoindre') {
    if (salon.partie || salon.joueurs.length >= salon.total) throw new Error('Ce salon est complet ou la partie a commencé.');
    return { code: salon.code, token: session(salon, ajouter(salon, data.nom)) };
  }
  if (action === 'recuperer') {
    if (!salon.joueurs.some(j => j.id === data.joueur)) throw new Error('Cette place n’existe plus.');
    const maintenant = Date.now();
    for (const [secret, demande] of salon.demandes) {
      if (maintenant - demande.date > 10 * 60_000) salon.demandes.delete(secret);
    }
    if (salon.demandes.size >= 40) throw new Error('Trop de demandes de reprise. Réessaie plus tard.');
    const secret = jeton();
    salon.demandes.set(secret, { id: randomUUID(), joueur: data.joueur, statut: 'attente', date: maintenant });
    return { secret };
  }
  if (action === 'reprise') {
    const demande = salon.demandes.get(token);
    if (!demande || Date.now() - demande.date > 10 * 60_000) throw new Error('La demande a expiré.');
    return { statut: demande.statut, token: demande.token };
  }
  const joueur = salon.sessions.get(token);
  if (!joueur) throw Object.assign(new Error('Session expirée. Demande à reprendre ta place.'), { status: 401 });
  if (action === 'etat') return vue(salon, joueur);
  if (action === 'agir') {
    if (!salon.partie) throw new Error('La partie n’a pas commencé.');
    salon.partie.agir(joueur, data.numero, data.choix);
    return vue(salon, joueur);
  }
  if (joueur !== salon.config.hote) throw Object.assign(new Error('Cette action est réservée à l’hôte.'), { status: 403 });
  if (action === 'decision') {
    const demande = [...salon.demandes.values()].find(d => d.id === data.id && d.statut === 'attente' && Date.now() - d.date <= 10 * 60_000);
    if (!demande) throw new Error('Cette demande a expiré.');
    demande.statut = data.accepte === true ? 'acceptee' : 'refusee';
    if (demande.statut === 'acceptee') {
      for (const [cle, place] of salon.sessions) if (place === demande.joueur) salon.sessions.delete(cle);
      demande.token = session(salon, { id: demande.joueur });
    }
  } else if (action === 'lancer') {
    if (salon.partie || salon.joueurs.length !== salon.total) throw new Error('Toutes les places doivent être occupées.');
    salon.partie = new Partie(salon.joueurs, salon.config);
  } else if (action === 'retour') {
    if (salon.partie?.tour.type !== 'fin') throw new Error('La partie est encore en cours.');
    salon.partie = null;
  } else throw Object.assign(new Error('Action inconnue.'), { status: 404 });
  return vue(salon, joueur);
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

const formats = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png', mp3: 'audio/mpeg' };

const serveur = createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    const chemin = url.pathname;
    if (req.method === 'POST' && chemin === '/api/salons') return json(res, 201, creer(await lire(req)));
    const route = chemin.match(/^\/api\/salons\/([A-Z2-9]{6})\/([a-z]+)$/);
    if (route) {
      const [, code, action] = route;
      const salon = salons.get(code);
      if (!salon) return json(res, 404, { erreur: 'Ce salon n’existe plus.' });
      if (req.method === 'GET' && action === 'joueurs') return json(res, 200, { joueurs: salon.joueurs });
      if (req.method === 'GET' && action === 'qr') {
        const invitation = new URL(url.searchParams.get('url'));
        if (!['http:', 'https:'].includes(invitation.protocol) || invitation.pathname !== '/' ||
            invitation.search !== `?salon=${code}` || invitation.hash || invitation.username ||
            invitation.password || invitation.href.length > 250) throw new Error('Lien d’invitation invalide.');
        const png = await QRCode.toBuffer(invitation.href, { width: 240, margin: 2 });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        return res.end(png);
      }
      if (req.method !== 'POST') return json(res, 405, { erreur: 'Méthode invalide.' });
      return json(res, 200, gerer(salon, action, await lire(req), req.headers.authorization?.replace(/^Bearer /, '')));
    }
    const fichier = chemin === '/' ? '/index.html' : chemin;
    if (!['GET', 'HEAD'].includes(req.method) ||
        !/^\/(?:index\.html|style\.css|app\.js|illustrations\/[a-z-]+\.png|audio\/[a-z-]+\.mp3)$/.test(fichier)) {
      return json(res, 404, { erreur: 'Page introuvable.' });
    }
    const local = new URL(`./public${fichier}`, import.meta.url);
    const infos = await stat(local).catch(() => null);
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
