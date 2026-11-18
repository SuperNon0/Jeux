const app = document.querySelector('#app');
const entete = document.querySelector('#entete');
const navigation = document.querySelector('#navigation');
const onglets = document.querySelector('#onglets');
const feuille = document.querySelector('#feuille');
const avis = document.querySelector('#avis');
const nomination = document.querySelector('#nomination');

const zones = { accueil: ['Accueil', 'home'], salons: ['Mes salons', 'users'], partie: ['Partie', 'moon'],
  carte: ['Ma carte', 'layers'], journal: ['Journal', 'list'], admin: ['Administration', 'shield'], plus: ['Plus', 'dots'] };
const roles = {
  villageois: { nom: 'Villageois', camp: 'Village', pouvoir: 'Observe, débats et vote pour démasquer les Loups-Garous.' },
  loups: { nom: 'Loup-Garou', camp: 'Meute', pouvoir: 'Choisis une cible chaque nuit avec les membres de ta meute.' },
  voyante: { nom: 'Voyante', camp: 'Village', pouvoir: 'Découvre le rôle d’une personne chaque nuit. Tes révélations restent dans ton journal privé.' },
  sorciere: { nom: 'Sorcière', camp: 'Village', pouvoir: 'Tu as une potion de soin et une de poison. Chacune ne s’utilise qu’une fois.' },
  chasseur: { nom: 'Chasseur', camp: 'Village', pouvoir: 'Si les loups ou le vote t’éliminent, choisis une personne à emporter.' },
};
const phases = {
  distribution: ['Distribution', 'Découvre ton rôle', 'Retourne ta carte à l’abri des regards, puis indique que tu es prêt.', 'layers'],
  nuit: ['Nuit', 'Le village dort', 'Les personnes appelées agissent sur leur téléphone. La suite s’affichera ici.', 'moon'],
  voyante: ['Nuit', 'Découvre un rôle', 'Touche un joueur pour révéler sa carte. Tu pourras la revoir dans ton journal privé.', 'eye'],
  loups: ['Nuit', 'Choisissez votre cible', 'Vote pour la personne que ta meute attaquera cette nuit.', 'moon'],
  sorciere: ['Nuit', 'Choisis tes potions', 'Tu peux garder tes potions pour une autre nuit.', 'sparkle'],
  debat: ['Jour', 'Le village débat', 'Discutez à voix haute. L’hôte ouvre le vote quand tout le monde est prêt.', 'chat'],
  election: ['Élection', 'Élisez le maire', 'Le maire a une voix double lors des votes d’élimination et départage les égalités.', 'star'],
  egaliteElection: ['Élection', 'Égalité à l’élection', 'L’hôte peut relancer le vote ou tirer au sort parmi les personnes à égalité.', 'dice'],
  vote: ['Vote', 'Choisissez qui éliminer', 'Chaque personne encore en jeu vote en privé.', 'list'],
  egaliteVote: ['Vote', 'Une égalité persiste', 'L’hôte peut relancer le vote ou tirer au sort parmi les personnes à égalité.', 'dice'],
  departage: ['Vote', 'Le maire départage', 'Le maire choisit parmi les personnes arrivées en tête.', 'star'],
  chasseur: ['Dernier pouvoir', 'Le dernier tir', 'Le Chasseur choisit une personne à emporter.', 'shield'],
  succession: ['Mairie', 'Transmets le titre', 'Le maire éliminé désigne son successeur parmi les survivants.', 'star'],
};
const statuts = { ouvert: ['Salon ouvert', 'users'], 'en-cours': ['En cours', 'play'], pause: ['En pause', 'clock'],
  terminee: ['Terminée', 'check'], expire: ['Expiré', 'alert'], aRecuperer: ['Place à reprendre', 'rotate'] };
const accents = { lavande: 'Lavande', menthe: 'Menthe', or: 'Or', ambre: 'Ambre', corail: 'Corail' };
const codeValide = /^[A-HJ-NP-Z2-9]{6}$/;
const cleSession = code => `jeux-session-${code}`;
const cleSalons = 'jeux-salons';
const cleFavoris = 'jeux-compositions';
const hebergement = await fetch('/api/configuration', { signal: AbortSignal.timeout(5000) })
  .then(reponse => reponse.ok ? reponse.json() : {}).catch(() => ({}));
const enInvite = hebergement.mode === 'invite';
const enHote = hebergement.mode === 'hote';
const cleReprise = code => `jeux-reprise-${code}`;
const lecteur = new Audio();
// Deux échantillons silencieux amorcent le lecteur pendant le geste de l’hôte.
const silence = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
const mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)');
const sauvegarde = {
  lire(cle) { try { return localStorage.getItem(cle); } catch { return null; } },
  ecrire(cle, valeur) { try { localStorage.setItem(cle, valeur); } catch {} },
  oublier(cle) { try { localStorage.removeItem(cle); } catch {} },
};

let favoris;
try { favoris = JSON.parse(sauvegarde.lire(cleFavoris)) ?? []; } catch { favoris = []; }
if (!Array.isArray(favoris)) favoris = [];
let connus;
try { connus = JSON.parse(sauvegarde.lire(cleSalons)) ?? {}; } catch { connus = {}; }
if (!connus || typeof connus !== 'object' || Array.isArray(connus)) connus = {};
try {
  for (const cle of Object.keys(localStorage)) {
    const ancien = cle.match(/^jeux-session-([A-HJ-NP-Z2-9]{6})$/)?.[1];
    if (ancien && !connus[ancien]) connus[ancien] = { code: ancien };
  }
} catch {}
const url = new URL(location.href);
const entree = (url.searchParams.get('salon') ?? '').toUpperCase();
let code = codeValide.test(entree) ? entree : '';
let token = code ? sauvegarde.lire(cleSession(code)) : null;
let zone = token ? 'partie' : url.searchParams.get('vue') === 'salons' ? 'salons' : enHote && !code ? 'admin' : 'accueil';
let donneesAdmin, chargementAdmin = false, erreurAdmin = '';
let reprise = code && !token ? sauvegarde.lire(cleReprise(code)) : null;
let etat, erreur, minuterieAvis, minuterieMaire, envoi = false, synchronise = false, revision = 0;
let revelee = false;
let decalageHorloge = 0;
let configurationSon = hebergement.son ?? { volume: 100, associations: {} };
let contexteAudio;
const gainsAudio = new WeakMap();
let choixCible = { numero: undefined, valeur: null };
let son = false, lecture = false, dernierSon = 0, piste = 0, file = [];
let reprendrePiste;
let renduPage = '';
let theme = sauvegarde.lire('jeux-theme');
theme = { clair: 'light', sombre: 'dark', light: 'light', dark: 'dark', auto: 'auto' }[theme] ?? 'auto';
let accent = sauvegarde.lire('jeux-accent');
if (!Object.hasOwn(accents, accent)) accent = 'lavande';

const echapper = valeur => String(valeur ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icone = (nom, taille = 20) => `<svg class="i s${taille}" aria-hidden="true"><use href="/icones.svg#i-${nom}"></use></svg>`;
const marque = `<a class="brand" href="/" data-action="accueil"><span class="embleme">${icone('moon', 22)}</span><span class="wm">Jeux</span></a>`;
const medaille = '<img class="medaille" src="/illustrations/medaillon-maire.png" alt="Maire">';
const art = nom => `<span class="art art-${nom}" aria-hidden="true"></span>`;
const pseudo = '<label class="champ-jeu">Ton pseudo<input name="nom" required maxlength="24" autocomplete="nickname" placeholder="Ex. Camille"></label>';
const bouton = (texte, nom, classe, attributs = '') => `<button type="button" class="btn ${classe}" ${attributs}>${icone(nom, 18)}${texte}</button>`;
const action = (texte, nom, id, classe = '', attributs = '') => bouton(texte, nom, classe, `data-action="${id}" ${attributs}`);
const etiquette = id => etat.joueurs.find(j => j.id === id)?.nom ?? '';
const initiales = nom => [...nom.trim()].slice(0, 2).join('').toLocaleUpperCase('fr');
const pastille = (texte, nom, classe = '') => `<span class="statut ${classe}">${icone(nom, 16)}${texte}</span>`;
const dateRelative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

function aide(id, sujet, texte) {
  return `<span class="aide-info"><button type="button" class="aide-bouton" popovertarget="info-${id}"
    aria-label="En savoir plus : ${echapper(sujet)}">${icone('help', 18)}</button>
    <span class="aide-popup" id="info-${id}" popover><strong>${echapper(sujet)}</strong><span>${echapper(texte)}</span></span></span>`;
}

function appliquerApparence() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
}
appliquerApparence();

function afficherAvis(message, duree = 0) {
  clearTimeout(minuterieAvis);
  const avisFeuille = feuille.querySelector('[data-avis]');
  const destination = feuille.open && avisFeuille ? avisFeuille : avis;
  for (const element of [avis, avisFeuille].filter(Boolean)) {
    element.textContent = element === destination ? message ?? '' : '';
    element.hidden = !element.textContent;
  }
  if (message && duree) minuterieAvis = setTimeout(() => afficherAvis(), duree);
}

function memoriser(resume) {
  connus[resume.code] = { ...connus[resume.code], ...resume };
  sauvegarde.ecrire(cleSalons, JSON.stringify(connus));
}

function enregistrer(session) {
  code = session.code;
  token = session.token;
  sauvegarde.ecrire(cleSession(code), token);
  sauvegarde.oublier(cleReprise(code));
  memoriser({ code });
  history.replaceState(null, '', `?salon=${code}`);
}

async function api(action, data, identifiant = token, salle = code) {
  const base = action ? `/api/salons/${salle}/${action}` : '/api/salons';
  const options = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(identifiant && { Authorization: `Bearer ${identifiant}` }) },
    body: JSON.stringify(data),
  };
  return requete(base, options);
}

async function requete(adresse, options) {
  let reponse;
  try { reponse = await fetch(adresse, { ...options, signal: AbortSignal.timeout(options?.method === 'PUT' ? 30_000 : 8000) }); }
  catch { throw new Error('Connexion interrompue. Réessaie dans un instant.'); }
  const resultat = await reponse.json().catch(() => null);
  if (!reponse.ok || !resultat) {
    throw Object.assign(new Error(resultat?.erreur ?? 'Le serveur ne répond pas correctement.'), { status: reponse.status });
  }
  return resultat;
}

function reglerVolume(media, volume) {
  try {
    let gain = gainsAudio.get(media);
    if (!gain) {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) { media.volume = volume / 100; return; }
      contexteAudio ??= new AudioContext();
      gain = contexteAudio.createGain();
      contexteAudio.createMediaElementSource(media).connect(gain).connect(contexteAudio.destination);
      gainsAudio.set(media, gain);
    }
    gain.gain.value = volume / 100;
    if (contexteAudio.state === 'suspended') contexteAudio.resume().catch(() => {});
  } catch { media.volume = volume / 100; }
}

function stopperNarration() {
  reprendrePiste = null;
  piste++;
  lecteur.pause();
  lecture = false;
  file = [];
}

function annoncesSonores(annonces, depuis) {
  return annonces.filter(a => a.id > depuis && /^[a-z-]+$/.test(a.fichier ?? '')).map(a => a.fichier);
}

function pisteSuivante() {
  if (!son || lecture || !file.length || etat?.partie?.pause) return;
  const id = ++piste;
  const evenement = file.shift();
  const fichier = evenement ? configurationSon.associations[evenement] ?? `${evenement}.mp3` : null;
  lecture = true;
  reglerVolume(lecteur, configurationSon.volume);
  lecteur.src = fichier ? `/audio/${encodeURIComponent(fichier)}` : silence;
  lecteur.onended = () => terminer();
  lecteur.onerror = () => terminer(true);
  reprendrePiste = () => lecteur.play().catch(erreurLecture => {
    if (id !== piste || !lecture || (etat?.partie?.pause && erreurLecture.name === 'AbortError')) return;
    if (erreurLecture.name === 'NotAllowedError') {
      son = false;
      stopperNarration();
      afficherAvis('Le navigateur bloque le son. Appuie sur « Activer le son » pour réessayer.');
      afficher();
    } else terminer(true);
  });
  reprendrePiste();

  function terminer(echec) {
    if (id !== piste || !lecture) return;
    lecture = false;
    reprendrePiste = null;
    if (echec && fichier) afficherAvis(`Annonce indisponible : ${fichier}`, 4000);
    pisteSuivante();
  }
}

function actualiser(nouveau) {
  if (nouveau.son) configurationSon = nouveau.son;
  decalageHorloge = (nouveau.horloge ?? Date.now()) - Date.now();
  const precedente = etat?.partie;
  const partie = nouveau.partie;
  if (precedente?.id !== partie?.id) {
    revelee = false;
    choixCible = { numero: undefined, valeur: null };
    dernierSon = 0;
    if (precedente && !precedente.gagnant) stopperNarration();
    if (partie) zone = 'partie';
    if (!partie && ['carte', 'journal'].includes(zone)) zone = 'partie';
  }
  const annonces = partie?.annonces ?? [];
  const recentes = annonces.filter(a => a.id > dernierSon);
  const revelation = precedente && precedente.id === partie?.id && partie.historique.length > precedente.historique.length
    ? partie.historique.at(-1) : null;
  etat = nouveau;
  if (son && nouveau.hote) {
    file.push(...annoncesSonores(annonces, dernierSon));
    if (partie?.pause) {
      if (!precedente?.pause && lecture) lecteur.pause();
    } else if (lecture && precedente?.pause) reprendrePiste?.();
    else pisteSuivante();
  }
  const maire = precedente?.id === partie?.id && recentes.findLast(a => ['maire-elu', 'nouveau-maire'].includes(a.fichier));
  if (maire) {
    nomination.querySelector('span').textContent = maire.message;
    nomination.hidden = false;
    clearTimeout(minuterieMaire);
    minuterieMaire = setTimeout(() => { nomination.hidden = true; }, 4500);
  }
  dernierSon = annonces.at(-1)?.id ?? 0;
  memoriser(nouveau.resume);
  afficher();
  if (revelation) ouvrirFeuille('revelation', revelation);
}

async function synchroniser() {
  if (envoi || synchronise || (!token && !reprise)) return;
  synchronise = true;
  const version = revision;
  try {
    if (token) {
      const nouveau = await api('etat', {});
      if (version === revision) {
        if (erreur) { erreur = null; afficherAvis(); }
        actualiser(nouveau);
      }
    } else if (reprise) {
      const resultat = await api('reprise', {}, reprise);
      if (version !== revision) return;
      if (resultat.statut === 'acceptee') {
        fermerFeuille(false);
        enregistrer({ code, token: resultat.token });
        reprise = null;
        const nouveau = await api('etat', {});
        if (version === revision) { fermerFeuille(false); zone = 'partie'; actualiser(nouveau); }
      } else if (resultat.statut === 'refusee') {
        reprise = null;
        sauvegarde.oublier(cleReprise(code));
        fermerFeuille();
        afficherAvis('La demande a été refusée.', 5000);
      }
    }
  } catch (incident) {
    if (version !== revision) return;
    if (token && [401, 404].includes(incident.status)) {
      sauvegarde.oublier(cleSession(code));
      memoriser({ code, statut: incident.status === 404 ? 'expire' : 'aRecuperer' });
      token = null;
      etat = null;
      zone = 'accueil';
      son = false;
      stopperNarration();
      afficher();
    }
    if (reprise && [400, 404].includes(incident.status)) {
      reprise = null;
      sauvegarde.oublier(cleReprise(code));
      fermerFeuille();
    }
    if (erreur !== incident.message) afficherAvis(incident.message);
    erreur = incident.message;
  } finally { synchronise = false; }
}

let actualiseLe = 0;
async function actualiserListe() {
  actualiseLe = Date.now();
  const demandes = Object.keys(connus).filter(salle => codeValide.test(salle)).map(async salle => {
    const acces = sauvegarde.lire(cleSession(salle));
    if (!acces) return;
    try { memoriser(await api('apercu', {}, acces, salle)); }
    catch (incident) {
      if (incident.status === 404) memoriser({ code: salle, statut: 'expire' });
      if (incident.status === 401) {
        sauvegarde.oublier(cleSession(salle));
        memoriser({ code: salle, statut: 'aRecuperer' });
      }
    }
  });
  await Promise.all(demandes);
  if (!etat) afficher();
}

function navigationActuelle() {
  const liens = etat ? etat.partie ? ['partie', 'carte', 'journal'] : ['partie', 'salons'] : ['accueil', 'salons'];
  return [...liens, ...(enHote ? ['admin'] : []), 'plus'];
}

function rendreNavigation() {
  const liens = navigationActuelle();
  const doitAgir = etat?.partie?.action && zone !== 'partie';
  const titre = (cle, mobile) => cle === 'partie' && !etat?.partie ? 'Salon' : mobile && cle === 'admin' ? 'Admin' : zones[cle][0];
  const item = (cle, mobile) => {
    const selection = zone === cle;
    const contenu = mobile ? `<span class="ti">${icone(zones[cle][1], 22)}</span>${titre(cle, mobile)}` : `${icone(zones[cle][1])}<span>${titre(cle, mobile)}</span>`;
    const rappel = cle === 'partie' && doitAgir;
    return `<button type="button" class="${mobile ? 'tab' : 'side-it'} ${selection ? 'on' : ''}" data-nav="${cle}"
      ${selection ? 'aria-current="page"' : ''} ${cle === 'plus' ? 'aria-haspopup="dialog"' : ''}${rappel ? ' aria-label="Partie, à toi de jouer"' : ''}>${contenu}${rappel ? '<span class="appel" aria-hidden="true"></span>' : ''}</button>`;
  };
  const haut = `${marque}<div class="entete-actions">${etat ? `<span class="code-entete mono">${code}</span>` : ''}
    ${action('<span class="sr">Apparence</span>', 'palette', 'apparence', 'ico gh', 'aria-label="Apparence"')}
    ${action('<span class="sr">Rechercher</span>', 'search', 'rechercher', 'ico gh', 'aria-label="Rechercher" aria-haspopup="dialog"')}</div>`;
  const raccourci = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const lateral = `${marque}<button class="side-search" type="button" data-action="rechercher" aria-haspopup="dialog">
    ${icone('search', 16)}<span>Rechercher</span><kbd class="kbd">${raccourci}</kbd></button><nav class="nav-laterale" aria-label="Navigation principale">${liens.map(cle => item(cle, false)).join('')}</nav>
    <div class="side-foot">${etat ? `<div class="identite"><span class="avatar">${echapper(initiales(etiquette(etat.joueur)))}</span>
    <span>${echapper(etiquette(etat.joueur))}<small>${etat.hote ? 'Hôte du salon' : 'Dans le salon'}</small></span></div>` : ''}
    ${action('Apparence', 'palette', 'apparence', 'gh')}</div>`;
  for (const [element, html] of [[entete, haut], [navigation, lateral], [onglets, liens.map(cle => item(cle, true)).join('')]]) {
    if (element.dataset.rendu !== html) { element.innerHTML = html; element.dataset.rendu = html; }
  }
}

function entetePage(titre, sousTitre, supplement = '') {
  return `<div class="entete-page"><div><h1 class="ttl">${titre}</h1>${sousTitre ? `<p class="soft">${sousTitre}</p>` : ''}</div>${supplement}</div>`;
}

function afficheScene(classe, titre, texte, boutons = '', note = '') {
  return `<section class="scene ${classe}">
    <div class="scene-image">${art(classe.includes('jour') ? 'jour' : 'nuit')}</div>
    <div class="scene-texte">${note}${titre}${texte ? `<p>${texte}</p>` : ''}${boutons ? `<div class="actions">${boutons}</div>` : ''}</div>
  </section>`;
}

function accueil() {
  const creerSalon = enInvite ? '' : action('Créer un salon', 'plus', 'creer', 'pri');
  const rejoindreSalon = enHote
    ? `<a class="btn sur-image" href="${echapper(hebergement.origineInvites)}">${icone('arrow', 18)}Accès invité</a>`
    : action('Rejoindre', 'arrow', 'rejoindre', enInvite ? 'pri' : 'sur-image');
  const demo = action('Essayer la démo', 'play', 'demo', 'sur-image');
  const lien = code ? `Invitation au salon <strong>${code}</strong>.` : 'Une carte et des votes privés sur chaque téléphone.';
  const actifs = Object.values(connus).filter(s => s && s.statut !== 'expire').sort((a, b) => (b.activite ?? 0) - (a.activite ?? 0));
  return `${afficheScene('scene-accueil', '<h1 class="ttl">Loup-Garou</h1>', lien,
      code ? action('Rejoindre le salon', 'arrow', 'rejoindre', 'pri') + action('Reprendre ma place', 'rotate', 'reprise', 'sur-image')
        : creerSalon + rejoindreSalon + demo,
      `<span class="scene-etiquette">${icone('users', 16)}5 à 16 joueurs</span>`)}
    ${actifs.length ? `<section class="bloc"><div class="titre-bloc"><h2 class="ttl">Reprendre une partie</h2>
      <button class="lien" type="button" data-nav="salons">Tous mes salons ${icone('chev', 16)}</button></div>
      ${carteSalon(actifs[0])}</section>` : ''}
    <section class="bloc"><div class="titre-bloc"><h2 class="ttl">Les rôles</h2>
      <button class="lien" type="button" data-action="regles">Comment jouer ${icone('chev', 16)}</button></div>
      <div class="roles">${Object.entries(roles).map(([id, role]) => `<button type="button" class="role" data-action="role" data-role="${id}">${art(id)}<span><strong>${role.nom}</strong><small>${role.camp}</small></span></button>`).join('')}</div>
    </section>`;
}

function carteSalon(salon) {
  const [label, ic] = statuts[salon.statut] ?? ['Reprendre', 'rotate'];
  const minutes = salon.activite ? Math.max(0, Math.floor((Date.now() - salon.activite) / 60_000)) : null;
  const dernier = minutes === null ? '' : minutes === 0 ? 'à l’instant'
    : minutes < 60 ? dateRelative.format(-minutes, 'minute') : dateRelative.format(-Math.floor(minutes / 60), 'hour');
  const details = [salon.nom, salon.jour ? `Tour ${salon.jour}` : '', salon.total ? `${salon.joueurs}/${salon.total} places` : '', dernier].filter(Boolean);
  return `<article class="panneau carte-salon"><span class="embleme">${icone(ic)}</span><div class="info-salon">
    <h3>${salon.demo ? 'Démo' : 'Salon'} <span class="mono">${echapper(salon.code)}</span></h3><small class="soft">${details.map(echapper).join(' · ')}</small>
    </div>${pastille(label, ic, salon.statut === 'pause' ? 'pause' : salon.statut === 'expire' ? 'danger' : '')}
    ${salon.statut === 'expire' ? action('Retirer', 'x', 'oublier', 'gh', `data-code="${echapper(salon.code)}"`)
      : `<a class="btn" href="/?salon=${echapper(salon.code)}">${icone('arrow', 18)}${salon.statut === 'aRecuperer' ? 'Récupérer' : 'Ouvrir'}</a>`}</article>`;
}

function mesSalons() {
  const liste = Object.values(connus).filter(s => s && codeValide.test(s.code)).sort((a, b) => (b.activite ?? 0) - (a.activite ?? 0));
  const ajouter = enHote ? action('Créer un salon', 'plus', 'creer', 'pri') : action('Rejoindre', 'arrow', 'rejoindre', 'pri');
  return `${entetePage('Mes salons', 'Retrouve les parties rejointes sur cet appareil.', ajouter)}
    ${liste.length ? `<section class="liste-salons">${liste.map(carteSalon).join('')}</section>`
      : `<section class="panneau vide"><span class="embleme">${icone('users', 24)}</span><h2 class="ttl">Aucun salon pour le moment</h2>
      <p class="soft">Tes salons apparaîtront ici après ta première partie.</p>${enHote ? '' : enInvite ? ajouter : action('Créer un salon', 'plus', 'creer', 'pri')}</section>`}`;
}

function ligneJoueur(j, p) {
  const vivant = !p || p.vivants.includes(j.id);
  const role = p?.bilan?.[j.id];
  return `<li class="joueur ${vivant ? '' : 'elimine'}"><span class="avatar">${echapper(initiales(j.nom))}</span>
    <div><strong>${echapper(j.nom)}${j.id === etat.joueur ? ' <small>· Toi</small>' : ''}</strong>
    <small class="muted">${[j.id === etat.hoteId ? 'Hôte' : j.id === etat.cohoteId ? 'Co-hôte' : '', role ? roles[role].nom : vivant ? j.enLigne ? 'En ligne' : 'Hors ligne' : 'Éliminé'].filter(Boolean).join(' · ')}</small></div>
    ${p?.maire === j.id ? medaille : `<span class="point ${j.enLigne && vivant ? 'connecte' : ''}" aria-hidden="true"></span>`}</li>`;
}

function panneauJoueurs(p) {
  const total = p ? p.vivants.length : etat.total;
  const n = p ? etat.joueurs.filter(j => j.enLigne && p.vivants.includes(j.id)).length : etat.joueurs.length;
  const places = !p && etat.total > etat.joueurs.length;
  return `<section class="panneau tableau-joueurs">
    <div class="titre-bloc"><h2 class="ttl">${p ? 'Le village' : 'Dans le salon'}</h2><span class="mono compteur">${n}/${total}${p ? ' en ligne' : ''}</span></div>
    <ul class="joueurs">${etat.joueurs.map(j => ligneJoueur(j, p)).join('')}</ul>
    ${places ? `<p class="places soft">${icone('plus', 16)}${etat.total - etat.joueurs.length} place${etat.total - etat.joueurs.length === 1 ? '' : 's'} libre${etat.total - etat.joueurs.length === 1 ? '' : 's'}</p>` : ''}
    ${etat.hote ? demandes() : ''}
  </section>`;
}

function demandes() {
  if (!etat.demandes.length) return '';
  return `<div class="demandes">${etat.demandes.map(d => `<div class="notice"><p><strong>${echapper(d.nom)}</strong> demande à reprendre sa place.</p>
    <div class="actions">${action('Autoriser', 'check', 'decision', 'pri', `data-id="${d.id}" data-accepte="oui"`)}
    ${action('Refuser', 'x', 'decision', 'gh', `data-id="${d.id}"`)}</div></div>`).join('')}</div>`;
}

function invitation() {
  const url = new URL(`/?salon=${code}`, hebergement.origineInvites ?? location.origin);
  return `<div class="invitation">
    <img class="qr" width="112" height="112" alt="QR code du salon ${code}" src="/api/salons/${code}/qr?url=${encodeURIComponent(url.href)}">
    <div><p class="muted">Code du salon</p><strong class="code-jeu mono">${code}</strong>
    ${action('Copier le lien', 'copy', 'copier', '', `data-url="${echapper(url.href)}"`)}</div></div>`;
}

function boutonSon() {
  return action(son ? 'Couper le son' : 'Activer le son', son ? 'check' : 'play', 'son', 'gh', `aria-pressed="${son}"`);
}

function salon() {
  const complet = etat.joueurs.length === etat.total && etat.joueurs.every(j => j.enLigne);
  return `${entetePage('Salon', etat.hote ? 'Invite les joueurs, puis lance la partie.' : 'La partie démarre quand l’hôte est prêt.',
      action('Quitter l’écran', 'logout', 'sortir', 'gh'))}
    <div class="grille-partie grille-salon">
      <section class="panneau panneau-invitation"><h2 class="ttl">Inviter des amis ${aide('qr', 'Invitation', 'Les joueurs scannent le QR ou ouvrent le lien sur leur téléphone. Une personne qui a perdu son accès peut demander à reprendre son pseudo.')}</h2>${invitation()}</section>
      <section class="panneau commandes-salon panneau-lancer">
         <div><h2 class="ttl">Lancer la partie</h2><p class="soft">${!complet ? 'Toutes les places doivent être occupées et en ligne.' : etat.hote ? 'Tout le monde est là.' : 'En attente de l’hôte.'}</p></div>
         ${etat.hote ? `<div class="actions">${boutonSon()}${action('Démarrer', 'play', 'lancer', 'pri', complet ? '' : 'disabled')}
           ${etat.joueurs.length > 1 ? action('Co-hôte', 'users', 'cohote', 'gh') : ''}</div>` : ''}
      </section>
      ${panneauJoueurs()}
      <section class="panneau panneau-composition"><h2 class="ttl">Composition</h2><div class="composition">${Object.entries(etat.config.composition)
        .filter(([, n]) => n).map(([id, n]) => `<span>${roles[id].nom} <b class="mono">×${n}</b></span>`).join('')}</div>
      <p class="soft">Maire ${etat.config.maire ? 'activé' : 'désactivé'} · Narration ${etat.config.discret ? 'discrète' : 'classique'}</p></section>
    </div>`;
}

const jourPhases = new Set(['debat', 'election', 'egaliteElection', 'vote', 'departage', 'egaliteVote', 'succession', 'chasseur']);

function etapes(p) {
  const phase = p.phase === 'distribution' ? 'carte' : p.phase === 'fin' ? 'fin' : jourPhases.has(p.phase) ? 'jour' : 'nuit';
  return `<ol class="etapes" aria-label="Phase de jeu">${[
    ['carte', 'layers', 'Cartes'], ['nuit', 'moon', 'Nuit'], ['jour', 'sun', 'Jour'], ['fin', 'star', 'Résultat'],
  ].map(([id, ic, titre]) => `<li ${id === phase ? 'aria-current="step"' : ''}>${icone(ic, 18)}${titre}</li>`).join('')}</ol>`;
}

function choixJoueurs(p) {
  if (choixCible.numero !== p.numero) choixCible = { numero: p.numero, valeur: null };
  const textes = { voyante: 'Examiner', loups: 'Confirmer la cible', election: 'Envoyer mon vote',
    vote: 'Envoyer mon vote', departage: 'Confirmer le départage', chasseur: 'Confirmer le tir', succession: 'Désigner le maire' };
  return `<form data-form="cible" data-numero="${p.numero}">
    <fieldset class="liste-cibles"><legend class="sr">Joueurs disponibles</legend>${p.action.cibles.map(id => `
      <label class="cible"><input type="radio" required name="cible" value="${id}" ${choixCible.valeur === id ? 'checked' : ''}>
      <span class="avatar">${echapper(initiales(etiquette(id)))}</span><strong>${echapper(etiquette(id))}${id === etat.joueur ? ' <small>· Toi</small>' : ''}</strong>
      ${p.maire === id ? medaille : ''}</label>`).join('')}</fieldset>
    <button class="btn pri" data-envoi>${icone('check', 18)}${textes[p.phase]}</button></form>`;
}

function ciblesVoyante(p) {
  return `<div class="liste-cibles">
    <p class="soft">Touche un joueur pour révéler sa carte.</p>
    ${p.action.cibles.map(id => {
      const nom = echapper(etiquette(id));
      return `<button type="button" class="cible cible-examen" data-action="agir" data-numero="${p.numero}"
        data-choix="${id}" aria-label="Examiner ${nom}">
        <span class="avatar">${echapper(initiales(etiquette(id)))}</span><strong>${nom}</strong>${icone('eye', 18)}</button>`;
    }).join('')}
  </div>`;
}

function boutonRevelation(p) {
  const revelation = p.historique.at(-1);
  if (!revelation || revelation.nuit !== p.jour) return '';
  return action('Revoir la carte révélée', 'eye', 'revelation', '', `data-index="${p.historique.length - 1}"`);
}

function commandes(p) {
  if (p.pause) return '';
  if (!p.action) {
    const sorti = !p.vivants.includes(etat.joueur);
    const message = p.aRepondu ? 'Ton choix est enregistré.' : sorti ? 'Tu suis la partie en spectateur.'
      : p.phase === 'nuit' ? 'Ton téléphone t’indiquera si tu dois agir.' : 'En attente des autres joueurs.';
    return `<p class="notice attente">${icone(p.aRepondu ? 'check' : sorti ? 'eye' : 'hourglass', 18)}${message}</p>`;
  }
  const agir = (texte, ic, classe = 'pri', choix = '') => action(texte, ic, 'agir', classe, `data-envoi data-numero="${p.numero}" ${choix ? `data-choix="${choix}"` : ''}`);
  if (p.phase === 'distribution') {
    return `<div class="actions">${action('Voir ma carte', 'eye', 'ouvrir-carte')}${agir('Je suis prêt', 'check')}</div>`;
  }
  if (p.phase === 'voyante') return ciblesVoyante(p);
  if (p.phase === 'debat') return agir('Ouvrir le vote', 'arrow');
  if (['egaliteElection', 'egaliteVote'].includes(p.phase)) {
    return `<p class="soft">${p.action.cibles.map(id => echapper(etiquette(id))).join(' · ')}</p>
      <div class="actions">${agir('Relancer le vote', 'refresh', 'pri', 'revoter')}${agir('Tirer au sort', 'dice', '', 'tirer')}</div>`;
  }
  if (p.phase === 'sorciere') {
    return `<form data-form="sorciere" data-numero="${p.numero}">
      ${p.action.soin ? `<label class="case"><input type="checkbox" name="soin">Sauver ${echapper(p.action.victime)}</label>` : ''}
      ${p.action.poison ? `<label class="champ-jeu">Potion de poison<select name="poison"><option value="">Garder la potion</option>
        ${p.action.cibles.map(id => `<option value="${id}">${echapper(etiquette(id))}</option>`).join('')}</select></label>` : ''}
      <button class="btn pri" data-envoi>${icone('check', 18)}Valider mes potions</button></form>`;
  }
  return choixJoueurs(p);
}

function journal(p) {
  const prive = p.historique;
  const evenements = p.annonces.filter(a => a.message).reverse();
  return `<div class="pile"><section class="panneau"><h2 class="ttl">Tes révélations</h2>
    ${prive.length ? `<ol class="journal-liste">${[...prive].reverse().map((a, index) => `<li>${icone('lock', 18)}
      <div><strong>${echapper(a.nom)} · ${roles[a.role].nom}</strong><small class="muted">Nuit ${a.nuit}</small>
      ${action('Voir la carte', 'eye', 'revelation', 'gh', `data-index="${prive.length - 1 - index}"`)}</div></li>`).join('')}</ol>`
      : '<p class="soft">Tes révélations de Voyante apparaîtront ici.</p>'}</section>
    <section class="panneau"><h2 class="ttl">Journal du village</h2>
      ${evenements.length ? `<ol class="journal-liste">${evenements.map(a => `<li>${icone('dot', 18)}<span>${echapper(a.message)}</span></li>`).join('')}</ol>`
      : '<p class="soft">Les événements apparaîtront au fil de la partie.</p>'}</section></div>`;
}

function carte(p) {
  const role = roles[p.role];
  return `<section class="panneau carte-zone">
    <div class="titre-bloc"><h2 class="ttl">Ta carte</h2>${pastille('Privée', 'lock')}</div>
    <button type="button" class="carte ${revelee ? 'revelee' : ''}" data-action="retourner" aria-pressed="${revelee}"
      aria-label="${revelee ? 'Cacher ma carte' : 'Retourner ma carte'}">
      <span class="face dos">${art('dos')}</span><span class="face recto">${art(p.role)}</span>
    </button>
    <div class="detail-carte" id="detail-carte">${detailCarte(p)}</div>
    ${p.action && p.phase === 'distribution' && revelee ? action('Je suis prêt', 'check', 'agir', 'pri', `data-numero="${p.numero}" data-envoi`) : ''}
  </section>`;

  function detailCarte(p) {
    if (!revelee) return '<p class="soft">Touche la carte pour révéler ton rôle.</p>';
    return `<h3 class="ttl">${role.nom}</h3><p class="soft">${role.pouvoir}</p>
      ${p.allies.length ? `<p class="soft">Ta meute · ${p.allies.map(echapper).join(', ')}</p>` : ''}`;
  }
}

function vuePhase(p) {
  if (p.phase === 'fin') {
    const victoire = { village: 'Le village l’emporte', loups: 'La meute l’emporte', egalite: 'Aucun camp ne survit' }[p.gagnant];
    return afficheScene('scene-jour resultat', `<h2 class="ttl">${victoire}</h2>`,
      'Les rôles de tous les joueurs sont révélés.',
      etat.hote ? action(etat.demo ? 'Recommencer la démo' : 'Retour au salon', 'rotate', 'retour', 'pri') : '', `<span class="scene-etiquette">${icone('star', 16)}Partie terminée</span>`);
  }
  const [label, titre, texte, ic] = phases[p.phase];
  const progression = p.progression;
  const derniere = p.annonces.findLast(a => a.message && (p.phase === 'debat' ? a.fichier?.startsWith('nuit-') :
    p.phase === 'vote' ? ['maire-elu', 'nouveau-maire'].includes(a.fichier) : false));
  const animateurPresent = etat.joueurs.some(j => j.enLigne && [etat.hoteId, etat.cohoteId].includes(j.id));
  return `<section class="panneau phase">
    <div class="phase-entete"><span class="embleme">${icone(ic, 24)}</span><div>
      <span class="lbl-mono">${label}</span><h2 class="ttl">${titre} ${aide('phase', titre, texte)}</h2></div>
      ${p.temps ? `<output class="temps-partie mono" data-temps aria-label="Temps restant">–</output>` : ''}</div>
    ${derniere ? `<div class="notice">${icone('list', 16)}${echapper(derniere.message)}</div>` : ''}
    ${progression ? `<div class="progression"><div><span>${p.phase === 'distribution' ? 'Joueurs prêts' : 'Votes reçus'}</span>
      <strong class="mono">${progression.reponses}/${progression.total}</strong></div>
      <progress value="${progression.reponses}" max="${progression.total}" aria-label="${p.phase === 'distribution' ? 'Joueurs prêts' : 'Votes reçus'}"></progress></div>` : ''}
    ${p.pause ? `<p class="notice">${icone('clock', 18)}Partie en pause</p>` : ''}
    ${!animateurPresent ? `<p class="notice avertissement">${icone('alert', 18)}Le salon attend un animateur.</p>` : ''}
    ${commandes(p)}
    ${boutonRevelation(p)}
    ${p.phase === 'distribution' && etat.hote ? boutonSon() : ''}
    ${etat.anime ? `<div class="actions commandes-phase">
      ${action(p.pause ? 'Reprendre' : 'Mettre en pause', p.pause ? 'play' : 'clock', p.pause ? 'reprendre' : 'pause', 'gh')}
      ${p.peutProlonger ? action('+30 s de débat', 'plus', 'prolonger', 'gh') : ''}
      ${p.peutPasser ? action('Passer les absents', 'chev', 'passer', 'gh') + aide('absents', 'Actions des absents', 'Après 15 secondes, tu peux passer les actions des personnes hors ligne. Leurs votes manquants comptent comme des abstentions.') : ''}
    </div>` : ''}</section>`;
}

function partie() {
  const p = etat.partie;
  return `${entetePage(etat.demo && zone === 'partie' ? 'Démo' : zones[zone][0],
      `${etat.demo ? 'Quatre joueurs simulés' : `Salon <span class="mono">${code}</span>`}${p.jour ? ` · Tour ${p.jour}` : ''}`,
      action('Options du salon', 'dots', 'plus', 'gh'))}
    ${etapes(p)}
    <div class="grille-partie"><div class="pile">
      ${zone === 'carte' ? carte(p) : zone === 'journal' ? journal(p) : vuePhase(p)}
    </div><div class="pile">${panneauJoueurs(p)}
      ${etat.hote && (p.phase !== 'distribution' || zone !== 'partie') ? `<section class="panneau commandes-salon"><div><h2 class="ttl">Narration ${aide('narration', 'Narration', 'Active le son sur un téléphone pour que les annonces soient diffusées à toute la table.')}</h2></div>${boutonSon()}</section>` : ''}
    </div></div>`;
}

const maintenanceLibelles = {
  pret: 'Prêt', 'en-attente': 'Demande envoyée', 'en-cours': 'Mise à jour en cours',
  terminee: 'Mise à jour terminée', 'deja-a-jour': 'La version installée est à jour', echec: 'La mise à jour a échoué',
  'pas-de-version': 'La version publiée ne prend pas encore en charge le panneau de mise à jour.',
};

const maintenanceEtapes = {
  telechargement: 'Téléchargement de la version', preparation: 'Préparation des dépendances',
  redemarrage: 'Redémarrage du jeu', verification: 'Vérification du service',
  restauration: 'Restauration de la version précédente',
};

function libelleMaintenance(maintenance) {
  return maintenance.statut === 'en-cours' && maintenanceEtapes[maintenance.etape]
    || maintenanceLibelles[maintenance.statut] || maintenance.statut;
}

function maintenanceEnCours() {
  return ['en-attente', 'en-cours'].includes(donneesAdmin?.maintenance.statut);
}

async function chargerAdmin() {
  if (!enHote || chargementAdmin) return;
  chargementAdmin = true;
  try {
    donneesAdmin = await requete('/api/admin');
    erreurAdmin = '';
  } catch (incident) { erreurAdmin = incident.message; }
  finally {
    chargementAdmin = false;
    if (zone === 'admin') afficher();
  }
}

function formulaireSon(audios, annonces, sonAdmin) {
  const evenement = annonces[0];
  return `<form data-form="son" class="options">
    <div class="titre-bloc"><h3 class="ttl">Son d’un événement</h3>${aide('association', 'Affectation des annonces',
      'Associe un MP3 à un moment de la partie. Le volume est partagé par les annonces. Le choix Par défaut réutilise le fichier d’origine de l’événement.')}</div>
    <label class="champ-jeu">Événement<select name="evenement">${annonces.map(nom =>
      `<option value="${nom}">${nom.replaceAll('-', ' ')}</option>`).join('')}</select></label>
    <label class="champ-jeu">MP3 choisi<select name="mp3"><option value="">Par défaut</option>
      ${audios.map(({ nom }) => `<option value="${echapper(nom)}" ${sonAdmin.associations[evenement] === nom ? 'selected' : ''}>${echapper(nom)}</option>`).join('')}</select></label>
    <label class="champ-jeu">Volume <span class="mono" data-volume>${sonAdmin.volume} %</span>
      <input type="range" name="volume" min="0" max="100" value="${sonAdmin.volume}"></label>
    <audio controls preload="none" data-lecteur-son hidden></audio>
    <div class="actions">${action('Écouter', 'play', 'essayer-son', 'gh')}
      <button class="btn pri" data-envoi>${icone('check', 18)}Enregistrer le son</button></div>
  </form>`;
}

function panneauAdmin() {
  const titre = entetePage('Administration', '',
    `<div class="actions">${action('Créer un salon', 'plus', 'creer', 'pri')}${action('Essayer la démo', 'play', 'demo', 'gh')}</div>`);
  if (!donneesAdmin) return `${titre}<div class="panneau chargement"><p class="soft">${echapper(erreurAdmin || 'Chargement du panneau…')}</p>
    ${erreurAdmin ? action('Réessayer', 'refresh', 'actualiser-admin') : '<div></div><div></div>'}</div>`;
  const { salons, audios, annonces, son: sonAdmin, maintenance, stockageAudio, version } = donneesAdmin;
  const optionsAudio = audios.map(audio => `<option value="${echapper(audio.nom)}">${echapper(audio.nom)}${audio.personnalise ? ' (personnalisé)' : ''}</option>`).join('');
  return `${titre}<nav class="raccourcis-admin" aria-label="Sections du panneau">
    ${[['admin-salons', 'Salons', 'users'], ['admin-audio', 'Audios', 'play'], ['admin-maj', 'Mise à jour', 'download']]
      .map(([id, texte, nom]) => `<button type="button" class="btn gh" data-action="section-admin" data-section="${id}">${icone(nom, 16)}${texte}</button>`).join('')}
    </nav><div class="grille-partie panneau-admin"><div class="pile">
    <section class="panneau" id="admin-salons" tabindex="-1">
      <div class="titre-bloc"><h2 class="ttl">Tous les salons ${aide('tous-salons', 'Tous les salons', 'Ce tableau inclut les parties en pause et les démos. Les cartes, les votes et les révélations restent privés.')}</h2>${action('Actualiser', 'refresh', 'actualiser-admin', 'gh')}</div>
      ${salons.length ? `<ul class="liste-admin-salons">${salons.map(salon => {
        const [label, ic] = statuts[salon.statut];
        return `<li><div><strong class="mono">${salon.code}</strong><small class="muted">${echapper(salon.hote)}
          · ${salon.joueurs}/${salon.total} places · ${salon.enLigne} en ligne${salon.jour ? ` · Tour ${salon.jour}` : ''}</small></div>
          ${pastille(label, ic, salon.statut === 'pause' ? 'pause' : '')}</li>`;
      }).join('')}</ul>` : '<p class="soft">Aucun salon enregistré pour le moment.</p>'}
    </section>
    <section class="panneau pile" id="admin-maj" tabindex="-1">
      <div><h2 class="ttl">Mise à jour ${aide('maj', 'Mise à jour', 'La mise à jour installe la version publiée sur GitHub. Le jeu redémarre brièvement. Les salons sauvegardés et les audios sont conservés.')}</h2><small class="mono muted">Version ${echapper(version)}</small></div>
      ${maintenance.actif ? `<p class="notice">${icone(maintenanceEnCours() ? 'hourglass' : maintenance.statut === 'echec' ? 'alert' : 'check', 18)}
        ${echapper(libelleMaintenance(maintenance))}${maintenance.statut === 'echec' ? ' · Consulte les journaux du conteneur.' : ''}</p>
        ${action('Mettre à jour', 'download', 'confirmer-maj', 'pri', maintenanceEnCours() ? 'disabled' : '')}`
        : '<p class="soft">Le service de mise à jour doit être installé sur le conteneur.</p>'}
      ${erreurAdmin ? `<p class="notice avertissement">${echapper(erreurAdmin)}</p>` : ''}
    </section>
  </div><section class="panneau pile" id="admin-audio" tabindex="-1">
    <div class="titre-bloc"><h2 class="ttl">Annonces audio ${aide('audio', 'Importer un MP3', 'Choisis un nom existant pour le remplacer ou ajoute un fichier à la bibliothèque. Le fichier doit faire au plus 8 Mio.')}</h2><span class="compteur mono">${audios.length} fichiers</span></div>
    ${stockageAudio ? `<form data-form="audio">
      <label class="champ-jeu">Annonce<select name="destination" required><option value="">Choisir une annonce</option>
        <option value="ajouter">Ajouter un nouveau MP3</option>${optionsAudio}</select></label>
      <label class="champ-jeu" data-nom-audio hidden>Nom du fichier<input name="nomAudio" maxlength="76"
        pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="exemple-annonce"><small class="soft">Le suffixe .mp3 sera ajouté.</small></label>
      <label class="champ-jeu">MP3 à importer<input name="fichier" type="file" accept=".mp3,audio/mpeg" required></label>
      <button class="btn pri" data-envoi>${icone('upload', 18)}Enregistrer le MP3</button>

    </form>` : '<p class="soft">Le dossier des annonces personnalisées doit être activé dans le conteneur.</p>'}
    <details class="avances audio-ecoute"><summary>Écouter une annonce ${icone('chevd', 16)}</summary>
      <div class="options"><label class="champ-jeu">Fichier à écouter<select data-ecoute><option value="">Choisir un fichier</option>
      ${optionsAudio}</select></label><audio controls preload="none" hidden data-lecteur-admin></audio></div>
    </details>
    ${formulaireSon(audios, annonces, sonAdmin)}
  </section></div>`;
}

function actualiserCompteur() {
  const sortie = app.querySelector('[data-temps]');
  const temps = etat?.partie?.temps;
  if (!sortie || !temps) return;
  const maintenant = temps.pauseDepuis ?? Date.now() + decalageHorloge;
  const restant = Math.max(0, Math.ceil((temps.echeance - maintenant) / 1000));
  sortie.value = `${Math.floor(restant / 60)}:${String(restant % 60).padStart(2, '0')}`;
}

function afficher() {
  rendreNavigation();
  let html;
  if (zone === 'admin') html = panneauAdmin();
  else if (zone === 'salons') html = mesSalons();
  else if (etat && zone === 'partie' && !etat.partie) html = salon();
  else if (etat?.partie && ['partie', 'carte', 'journal'].includes(zone)) html = partie();
  else if (token && !etat) html = `${entetePage('Connexion au salon', '')}<div class="panneau chargement"><p class="soft">Reprise du salon ${code}…</p><div></div><div></div></div>`;
  else html = accueil();
  if (html === renduPage) return;
  const focus = document.activeElement;
  const formulaire = app.querySelector('[data-form="sorciere"]');
  const valeurs = formulaire?.dataset.numero === String(etat?.partie?.numero) ? new FormData(formulaire) : null;
  const focusCible = focus?.name === 'cible' ? focus.value : null;
  const focusPotion = formulaire?.contains(focus) ? focus.name : '';
  app.innerHTML = html;
  renduPage = html;
  actualiserCompteur();
  if (valeurs) {
    const champs = app.querySelector('[data-form="sorciere"]')?.elements;
    if (champs?.soin) champs.soin.checked = valeurs.has('soin');
    if (champs?.poison) champs.poison.value = valeurs.get('poison');
    if (focusPotion) champs?.namedItem(focusPotion)?.focus({ preventScroll: true });
  }
  if (focusCible) {
    [...app.querySelectorAll('input[name="cible"]')].find(c => c.value === focusCible)?.focus({ preventScroll: true });
  }
}

const formCreation = () => `<form data-form="creer">
  ${pseudo}
  <label class="champ-jeu">Nombre de joueurs <select name="total">${Array.from({ length: 12 }, (_, i) => i + 5)
    .map(n => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${n} joueurs</option>`).join('')}</select></label>
  <label class="champ-jeu">Composition rapide<select name="preset">${optionsComposition()}</select></label>
  <fieldset class="modes"><legend>Type de partie ${aide('modes', 'Type de partie', 'Initiation utilise la Voyante, les loups et les villageois. Classique ajoute les potions et le tir du Chasseur.')}</legend>
    <label><input type="radio" name="mode" value="classique" checked><span><strong>Classique</strong><small>Voyante, potions et dernier tir.</small></span></label>
    <label><input type="radio" name="mode" value="express"><span><strong>Initiation</strong><small>Villageois, Voyante et loups.</small></span></label>
  </fieldset>
  <details class="avances"><summary>Personnaliser les règles ${icone('chevd', 16)}</summary>
    <div class="options">
      <label class="case"><input type="checkbox" name="maire" checked>Élection du maire</label>
      <label class="case"><input type="checkbox" name="discret">Appels de nuit discrets</label>
      <div class="options-roles">
        <label class="champ-jeu">Loups-Garous<input type="number" name="loups" min="1" max="2" value="1" required></label>
        <div class="options"><label class="case"><input type="checkbox" name="voyante" checked>Voyante</label>
        <label class="case"><input type="checkbox" name="sorciere" checked>Sorcière</label>
        <label class="case"><input type="checkbox" name="chasseur" checked>Chasseur</label></div>
      </div>
      <label class="champ-jeu">Ordre de nuit<select name="ordre">
        <option value="voyante,loups,sorciere">Voyante → Loups → Sorcière</option>
        <option value="loups,voyante,sorciere">Loups → Voyante → Sorcière</option>
        <option value="loups,sorciere,voyante">Loups → Sorcière → Voyante</option>
      </select></label>
    </div></details>
  <details class="avances"><summary>Chronomètres ${icone('chevd', 16)}</summary>
    <div class="options options-roles">
      <label class="champ-jeu">Débat (s)<input name="debatSecondes" type="number" min="0" max="900" value="120" required></label>
      <label class="champ-jeu">Vote (s)<input name="voteSecondes" type="number" min="0" max="900" value="60" required></label>
    </div>${aide('chronos', 'Chronomètres', 'Entre 15 et 900 secondes, ou 0 pour désactiver. À la fin du vote, les bulletins manquants deviennent des abstentions.')}</details>
  <p class="composition-prevision soft" id="projection"></p>
  <details class="avances"><summary>Mes favoris ${icone('chevd', 16)}</summary>
    <div class="actions"><label class="champ-jeu">Nom de la composition<input name="favori" maxlength="35" placeholder="Ex. Partie du vendredi"></label>
    ${action('Enregistrer', 'star', 'favori', 'gh')}</div></details>
  <button class="btn pri" data-envoi>${icone('plus', 18)}Créer le salon</button>
</form>`;

const compositions = [
  ['Petite table · 5 joueurs', 5, 1, 'express'],
  ['Table classique · 8 joueurs', 8, 2, 'classique'],
  ['Grande table · 12 joueurs', 12, 3, 'classique'],
];

function optionsComposition() {
  return '<option value="">Personnalisée</option>' + compositions.map(([nom], index) =>
    `<option value="modele-${index}">${nom}</option>`).join('') +
    favoris.map(({ nom }, index) => `<option value="favori-${index}">${echapper(nom)}</option>`).join('');
}

function reglageSalon(donnees) {
  const total = Number(donnees.get('total'));
  const composition = { loups: Number(donnees.get('loups')), voyante: Number(donnees.has('voyante')),
    sorciere: Number(donnees.has('sorciere')), chasseur: Number(donnees.has('chasseur')) };
  composition.villageois = total - Object.values(composition).reduce((a, b) => a + b, 0);
  return { total, composition, ordre: donnees.get('ordre').split(',').filter(id => composition[id]),
    maire: donnees.has('maire'), discret: donnees.has('discret'), debatSecondes: Number(donnees.get('debatSecondes')),
    voteSecondes: Number(donnees.get('voteSecondes')) };
}

function appliquerComposition(form) {
  const champs = form.elements;
  const selection = champs.preset.value;
  const [source, index] = selection.split('-');
  if (source === 'modele') {
    const [, total, loups, mode] = compositions[index];
    champs.total.value = total;
    champs.mode.value = mode;
    configurer(form, 'mode');
    champs.loups.value = loups;
    champs.preset.value = selection;
  } else if (source === 'favori') {
    const choix = favoris[index]?.champs;
    if (choix) {
      for (const nom of ['total', 'mode', 'loups', 'ordre', 'debatSecondes', 'voteSecondes']) champs[nom].value = choix[nom];
      for (const nom of ['maire', 'discret', 'voyante', 'sorciere', 'chasseur']) champs[nom].checked = choix[nom];
    }
  }
}

function enregistrerFavori(form) {
  const champs = form.elements;
  const nom = champs.favori.value.trim();
  if (!nom) return afficherAvis('Donne un nom à cette composition.');
  for (const nom of ['loups', 'debatSecondes', 'voteSecondes']) {
    if (!champs[nom].reportValidity()) return;
  }
  const valeurs = {};
  for (const cle of ['total', 'mode', 'loups', 'ordre', 'debatSecondes', 'voteSecondes']) valeurs[cle] = champs[cle].value;
  for (const cle of ['maire', 'discret', 'voyante', 'sorciere', 'chasseur']) valeurs[cle] = champs[cle].checked;
  favoris = [{ nom, champs: valeurs }, ...favoris.filter(favori => favori.nom !== nom)].slice(0, 16);
  sauvegarde.ecrire(cleFavoris, JSON.stringify(favoris));
  champs.preset.innerHTML = optionsComposition();
  champs.preset.value = 'favori-0';
  afficherAvis('Composition enregistrée sur cet appareil.', 4000);
}

function configurer(form, evenement) {
  const { total, loups, voyante, sorciere, chasseur, mode, maire } = form.elements;
  if (evenement === 'preset') appliquerComposition(form);
  if (['total', 'mode'].includes(evenement)) {
    loups.value = Number(total.value) >= 12 ? 3 : Number(total.value) >= 8 ? 2 : 1;
    if (evenement === 'mode') {
      sorciere.checked = chasseur.checked = mode.value === 'classique';
      maire.checked = mode.value === 'classique';
      voyante.checked = true;
    }
  }
  const taille = Number(total.value);
  const nombreLoups = Number(loups.value);
  const villageois = taille - nombreLoups - Number(voyante.checked) - Number(sorciere.checked) - Number(chasseur.checked);
  loups.max = Math.floor((taille - 1) / 2);
  for (const nom of ['debatSecondes', 'voteSecondes']) {
    const champ = form.elements[nom];
    champ.setCustomValidity(Number(champ.value) > 0 && Number(champ.value) < 15 ? '15 secondes au minimum, ou 0.' : '');
  }
  loups.setCustomValidity(villageois < 0 ? 'Il y a plus de rôles que de joueurs.' : '');
  form.querySelector('#projection').textContent = villageois >= 0
    ? `${nombreLoups} loup${nombreLoups > 1 ? 's' : ''} · ${villageois} villageois ordinaire${villageois > 1 ? 's' : ''}`
    : 'Réduis le nombre de rôles.';
  if (evenement && evenement !== 'preset' && evenement !== 'favori') form.elements.preset.value = '';
}

function recherche() {
  const raccourcis = [
    ['Mes salons', 'users', 'data-nav="salons"'],
    ...(!etat && !enInvite ? [['Créer un salon', 'plus', 'data-action="creer"']] : []),
    ...(!etat && !enHote ? [['Rejoindre une partie', 'arrow', 'data-action="rejoindre"']] : []),
    ...(etat ? [['Salon ou partie', 'moon', 'data-nav="partie"'], ['Invitation', 'share', 'data-action="invitation"']] : []),
    ...(etat?.partie ? [['Ma carte', 'layers', 'data-nav="carte"'], ['Journal', 'list', 'data-nav="journal"']] : []),
    ...(enHote ? [['Administration', 'shield', 'data-nav="admin"']] : []),
    ['Apparence', 'palette', 'data-action="apparence"'], ['Comment jouer', 'help', 'data-action="regles"'],
    ...Object.entries(roles).map(([id, role]) => [role.nom, 'layers', `data-action="role" data-role="${id}"`]),
  ];
  return `<label class="champ recherche-champ">${icone('search', 18)}
    <input type="search" data-recherche aria-label="Rechercher dans Jeux" placeholder="Salon, apparence, rôle…" autocomplete="off"></label>
    <div class="recherche-resultats">${raccourcis.map(([texte, nom, attributs]) => `
      <button type="button" class="pal-it" data-resultat ${attributs}><span class="ico">${icone(nom, 18)}</span><span class="tx">${texte}</span></button>`).join('')}
      <p class="soft resultat-vide" data-recherche-vide hidden>Aucun résultat.</p></div>`;
}

function contenuFeuille(type, contexte) {
  switch (type) {
    case 'creer': return ['Créer un salon', formCreation()];
    case 'cohote': return ['Co-hôte', `<form data-form="cohote">
      <label class="champ-jeu">Animateur délégué<select name="joueur"><option value="">Aucun co-hôte</option>
      ${etat.joueurs.filter(j => j.id !== etat.hoteId).map(j => `<option value="${j.id}" ${j.id === etat.cohoteId ? 'selected' : ''}>${echapper(j.nom)}</option>`).join('')}</select></label>
      <p class="soft">Co-hôte ${aide('choix-cohote', 'Co-hôte', 'Cette personne peut arbitrer ce salon, mettre la partie en pause, passer les absents et ouvrir le vote depuis sa place.')}</p>
      <button class="btn pri" data-envoi>${icone('check', 18)}Enregistrer</button></form>`];
    case 'rejoindre': return ['Rejoindre une partie', `<form data-form="rejoindre">
      <label class="champ-jeu">Code du salon<input name="code" required minlength="6" maxlength="6" pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}" value="${code}"
      autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234"></label>${pseudo}
      <button class="btn pri" data-envoi>${icone('arrow', 18)}Rejoindre</button></form>
      <button class="lien" type="button" data-action="reprise">${icone('rotate', 16)}Reprendre une place existante</button>`];
    case 'apparence': return ['Apparence', `<div class="options">
      <label class="champ-jeu">Thème<select name="theme" data-reglage="theme">
        ${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([valeur, titre]) =>
          `<option value="${valeur}" ${theme === valeur ? 'selected' : ''}>${titre}</option>`).join('')}</select></label>
      <div><p>Couleur d’accent</p><div class="selection-accents">${Object.entries(accents).map(([id, libelle]) =>
        `<button class="past" data-action="accent" data-v="${id}" aria-pressed="${id === accent}"><i></i>${libelle}</button>`).join('')}</div></div></div>`];
    case 'confirmer-maj': return ['Mettre à jour le jeu', `<form data-form="miseajour">
      <p>Le jeu sera indisponible pendant le redémarrage. Les parties sauvegardées seront reprises à la reconnexion.</p>
      <label class="case"><input type="checkbox" name="confirme" required>Je confirme la mise à jour et le redémarrage.</label>
      <button class="btn pri" data-envoi>${icone('download', 18)}Lancer la mise à jour</button></form>`];
    case 'rechercher': return ['Rechercher', recherche()];
    case 'plus': {
      const tuile = (texte, nom, id) => `<button type="button" class="qt" data-action="${id}">${icone(nom, 22)}${texte}</button>`;
      return ['Plus', `<div class="q-tuiles plus-t menu-plus-tuiles">
        ${tuile('Mes salons', 'users', 'liste')}${tuile('Apparence', 'palette', 'apparence')}
        ${tuile('Comment jouer', 'help', 'regles')}${tuile('Rechercher', 'search', 'rechercher')}</div>
        ${etat ? `<div class="menu-plus">${!etat.demo ? action('Inviter ou récupérer une place', 'share', 'invitation') : ''}
        ${etat.hote && !etat.demo && etat.joueurs.length > 1 ? action('Choisir un co-hôte', 'users', 'cohote') : ''}
        ${action('Quitter l’écran', 'logout', 'sortir', 'gh')}</div>` : ''}`];
    }
    case 'invitation': return ['Invitation', `<p class="soft">Scanne le QR ou partage le lien. Une personne qui a perdu sa session peut demander à reprendre sa place.</p>${invitation()}`];
    case 'reprise': return ['Reprendre ta place', reprise ? '<p class="notice">La demande a été envoyée à l’hôte.</p>' : `<form data-form="recuperer">
      <label class="champ-jeu">Ton ancien pseudo<select name="joueur" required><option value="">Choisis ton pseudo</option>
      ${(contexte ?? []).map(joueur => `<option value="${joueur.id}">${echapper(joueur.nom)}</option>`).join('')}</select></label>
      <button class="btn pri" data-envoi>${icone('rotate', 18)}Demander la reprise</button></form>`];
    case 'revelation': {
      const { nom, role } = contexte;
      return ['Carte révélée', `<section class="fiche-revelation">
        ${pastille('Révélation privée', 'lock')}
        <p class="soft">${echapper(nom)}</p><h3 class="ttl">${roles[role].nom}</h3>
        ${art(role)}
        <p class="soft">Camp ${roles[role].camp}</p>
        ${action('Continuer', 'arrow', 'fermer', 'pri')}</section>`];
    }
    case 'role': {
      const role = roles[contexte];
      return [role.nom, `<div class="fiche-role">${art(contexte)}<div><p class="lbl-mono">Camp ${role.camp}</p><p>${role.pouvoir}</p></div></div>`];
    }
    case 'regles': return ['Comment jouer', `<div class="faq">
      <details open><summary>Comment rejoindre les autres ?</summary><p>Scanne le QR code de l’hôte ou saisis les six caractères du salon, puis choisis ton pseudo. Garde le même navigateur pour retrouver ta place.</p></details>
      <details><summary>Que faire le jour et la nuit ?</summary><p>La nuit, seuls les rôles appelés agissent. Le jour, discute avec les autres, puis vote sur ton téléphone. La meute gagne si elle atteint la parité avec les autres survivants. Le village gagne s’il élimine tous les loups.</p></details>
      <details><summary>Que se passe-t-il si tout le monde quitte ?</summary><p>Le salon apparaît en pause dans Mes salons. Ouvre-le depuis le même navigateur pour retrouver ta place. Sur Proxmox, le salon est sauvegardé et reste accessible après un redémarrage. Il expire après 24 heures sans activité.</p></details>
      </div>`];
    default: return ['', ''];
  }
}

function afficherContenuFeuille(type, contexte) {
  const [titre, contenu] = contenuFeuille(type, contexte);
  feuille.dataset.type = type;
  feuille.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="tete-feuille"><h2 id="titre-feuille" class="ttl">${titre}</h2>
    ${action('<span class="sr">Fermer</span>', 'x', 'fermer', 'ico gh', 'aria-label="Fermer"')}</div><div class="corps-feuille"><p class="notification" data-avis role="status" hidden></p>${contenu}</div>`;
  const form = feuille.querySelector('[data-form="creer"]');
  if (form) configurer(form);
}

function ouvrirFeuille(type, contexte) {
  afficherContenuFeuille(type, contexte);
  if (!feuille.open) {
    feuille.showModal();
    document.body.classList.add('avec-feuille');
    afficherAvis();
    history.pushState({ ...history.state, feuille: true }, '');
  }
  if (type === 'rechercher') feuille.querySelector('[data-recherche]').focus();
}

function fermerFeuille(retour = true) {
  if (!feuille.open) return;
  feuille.close();
  document.body.classList.remove('avec-feuille');
  if (history.state?.feuille) {
    if (retour) history.back();
    else history.replaceState(null, '');
  }
}
window.addEventListener('popstate', () => {
  if (feuille.open) {
    feuille.close();
    document.body.classList.remove('avec-feuille');
  }
});
feuille.addEventListener('cancel', event => { event.preventDefault(); fermerFeuille(); });
feuille.addEventListener('click', event => { if (event.target === feuille) fermerFeuille(); });

async function executer(element, operation) {
  if (envoi) return;
  envoi = true;
  revision++;
  element?.setAttribute('aria-busy', 'true');
  if (element) element.disabled = true;
  afficherAvis();
  try { await operation(); }
  catch (incident) { afficherAvis(incident.message, 7000); }
  finally {
    envoi = false;
    element?.removeAttribute('aria-busy');
    if (element) element.disabled = false;
  }
}

function naviguer(destination) {
  fermerFeuille();
  zone = destination;
  if (destination !== 'carte') revelee = false;
  afficher();
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if (destination === 'salons' || destination === 'accueil') actualiserListe();
  if (destination === 'admin') chargerAdmin();
}

async function sortir() {
  const salle = code;
  if (token) {
    try { memoriser(await api('absence', {})); }
    catch { /* La présence expirera si le réseau est indisponible. */ }
  }
  stopperNarration();
  token = null;
  etat = null;
  code = '';
  reprise = null;
  revelee = false;
  son = false;
  if (feuille.open) {
    feuille.close();
    document.body.classList.remove('avec-feuille');
  }
  history.replaceState(null, '', '/?vue=salons');
  naviguer('salons');
  if (salle && !connus[salle]) memoriser({ code: salle });
}

async function copier(url) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(url);
    afficherAvis('Lien copié.', 3000);
    return;
  }
  const champ = document.createElement('input');
  champ.value = url;
  champ.readOnly = true;
  champ.className = 'copie-temporaire';
  (feuille.open ? feuille : document.body).append(champ);
  champ.select();
  const copie = document.execCommand('copy');
  champ.remove();
  if (!copie) throw new Error(`Lien à partager : ${url}`);
  afficherAvis('Lien copié.', 3000);
}

const texteRecherche = texte => texte.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '');

feuille.addEventListener('input', event => {
  if (!event.target.matches('[data-recherche]')) return;
  const requete = texteRecherche(event.target.value.trim());
  let trouve = false;
  for (const resultat of feuille.querySelectorAll('[data-resultat]')) {
    resultat.hidden = !texteRecherche(resultat.textContent).includes(requete);
    if (!resultat.hidden) trouve = true;
  }
  feuille.querySelector('[data-recherche-vide]').hidden = trouve;
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat) return;
  if (event.target.matches?.('[data-recherche]') && ['Enter', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const resultat = feuille.querySelector('[data-resultat]:not([hidden])');
    if (event.key === 'Enter') resultat?.click();
    else resultat?.focus();
    return;
  }
  if (feuille.open) return;
  const modifiable = event.target.closest?.('input,textarea,select,[contenteditable]');
  const commande = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
  if (commande || (event.key === '/' && !modifiable && !event.ctrlKey && !event.metaKey)) {
    event.preventDefault();
    ouvrirFeuille('rechercher');
  }
});

document.addEventListener('invalid', event => {
  const details = event.target.closest('.avances');
  if (details) details.open = true;
}, true);

document.addEventListener('input', event => {
  if (event.target.name !== 'volume' || event.target.form?.dataset.form !== 'son') return;
  event.target.form.querySelector('[data-volume]').textContent = `${event.target.value} %`;
  const apercu = event.target.form.querySelector('[data-lecteur-son]');
  if (!apercu.hidden) reglerVolume(apercu, Number(event.target.value));
});

document.addEventListener('change', event => {
  const champ = event.target;
  if (champ.name === 'evenement' && champ.form?.dataset.form === 'son') {
    champ.form.elements.mp3.value = donneesAdmin.son.associations[champ.value] ?? '';
    champ.form.querySelector('[data-lecteur-son]').pause();
  }
  if (champ.dataset.reglage === 'theme') {
    theme = champ.value;
    sauvegarde.ecrire('jeux-theme', theme);
    appliquerApparence();
  }
  if (champ.name === 'cible') choixCible.valeur = champ.value;
  if (champ.name === 'destination' && champ.form?.dataset.form === 'audio') {
    const nouveau = champ.form.querySelector('[data-nom-audio]');
    nouveau.hidden = champ.value !== 'ajouter';
    champ.form.elements.nomAudio.required = !nouveau.hidden;
    champ.form.elements.nomAudio.disabled = nouveau.hidden;
  }
  if (champ.matches('[data-ecoute]')) {
    const lecteurAdmin = app.querySelector('[data-lecteur-admin]');
    lecteurAdmin.pause();
    lecteurAdmin.hidden = !champ.value;
    if (champ.value) lecteurAdmin.src = `/audio/${encodeURIComponent(champ.value)}`;
    else lecteurAdmin.removeAttribute('src');
  }
  const form = champ.closest('[data-form="creer"]');
  if (form) configurer(form, champ.name);
});

document.addEventListener('submit', event => {
  const form = event.target;
  const actionForm = form.dataset.form;
  if (!actionForm) return;
  event.preventDefault();
  const data = new FormData(form);
  executer(event.submitter, async () => {
    if (actionForm === 'son') {
      const reglage = await requete('/api/admin/son', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evenement: data.get('evenement'), fichier: data.get('mp3'), volume: Number(data.get('volume')) }),
      });
      configurationSon = donneesAdmin.son = reglage;
      afficherAvis('Réglage audio enregistré.', 4000);
      return;
    }
    if (actionForm === 'cohote') {
      const nouveau = await api('cohote', { joueur: data.get('joueur') || null });
      fermerFeuille();
      actualiser(nouveau);
      return;
    }
    if (actionForm === 'audio') {
      const nom = data.get('destination') === 'ajouter' ? `${data.get('nomAudio')}.mp3` : data.get('destination');
      const fichier = data.get('fichier');
      if (fichier.size > 8 * 1024 * 1024) throw new Error('Le fichier doit faire au plus 8 Mio.');
      await requete(`/api/admin/audio/${encodeURIComponent(nom)}`, {
        method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, body: fichier,
      });
      form.reset();
      form.querySelector('[data-nom-audio]').hidden = true;
      form.elements.nomAudio.required = false;
      form.elements.nomAudio.disabled = true;
      await chargerAdmin();
      afficherAvis(`${nom} enregistré.`, 5000);
      return;
    }
    if (actionForm === 'miseajour') {
      donneesAdmin.maintenance = await requete('/api/admin/miseajour', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirme: data.has('confirme') }),
      });
      fermerFeuille();
      afficher();
      return;
    }
    if (actionForm === 'creer') {
      const session = await api('', { nom: data.get('nom'), ...reglageSalon(data) });
      fermerFeuille(false);
      enregistrer(session);
    } else if (actionForm === 'rejoindre') {
      const salle = data.get('code').toUpperCase();
      if (!codeValide.test(salle)) throw new Error('Le code du salon doit contenir six caractères.');
      const acces = sauvegarde.lire(cleSession(salle));
      if (acces) {
        try {
          const nouveau = await api('etat', {}, acces, salle);
          fermerFeuille(false);
          enregistrer({ code: salle, token: acces });
          zone = 'partie';
          actualiser(nouveau);
          return;
        } catch (incident) {
          if (incident.status !== 401) throw incident;
          sauvegarde.oublier(cleSession(salle));
        }
      }
      const session = await api('rejoindre', { nom: data.get('nom') }, null, salle);
      fermerFeuille(false);
      enregistrer(session);
    } else if (actionForm === 'recuperer') {
      reprise = (await api('recuperer', { joueur: data.get('joueur') })).secret;
      sauvegarde.ecrire(cleReprise(code), reprise);
      history.replaceState(history.state, '', `?salon=${code}`);
      afficherContenuFeuille('reprise');
      return;
    } else {
      const choix = actionForm === 'cible' ? data.get('cible') : { soin: data.has('soin'), poison: data.get('poison') || null };
      actualiser(await api('agir', { numero: Number(form.dataset.numero), choix }));
      return;
    }
    zone = 'partie';
    actualiser(await api('etat', {}));
  });
});

document.addEventListener('click', event => {
  const cible = event.target.closest('[data-nav],[data-action]');
  if (!cible) return;
  const { nav, action: id } = cible.dataset;
  if (nav) return nav === 'plus' ? ouvrirFeuille('plus') : naviguer(nav);
  if (id === 'accueil') {
    if (etat) { event.preventDefault(); naviguer('salons'); }
    return;
  }
  if (id === 'liste') return naviguer('salons');
  if (id === 'favori') return enregistrerFavori(cible.closest('form'));
  if (id === 'actualiser-admin') return chargerAdmin();
  if (id === 'section-admin') {
    const section = document.getElementById(cible.dataset.section);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: 'start', behavior: mouvementReduit.matches ? 'instant' : 'smooth' });
    return;
  }
  if (id === 'confirmer-maj') return ouvrirFeuille('confirmer-maj');
  if (id === 'creer' && enInvite) return;
  if (id === 'rejoindre' && enHote) {
    location.assign(new URL(code ? `/?salon=${code}` : '/', hebergement.origineInvites));
    return;
  }
  if (id === 'ouvrir-carte') return naviguer('carte');
  if (id === 'revelation') {
    const revelation = etat?.partie?.historique[Number(cible.dataset.index)];
    if (revelation) ouvrirFeuille('revelation', revelation);
    return;
  }
  if (id === 'fermer') return fermerFeuille();
  if (['creer', 'rejoindre', 'apparence', 'plus', 'regles', 'invitation', 'role', 'rechercher', 'cohote'].includes(id)) {
    return ouvrirFeuille(id, cible.dataset.role);
  }
  if (id === 'accent') {
    accent = cible.dataset.v;
    sauvegarde.ecrire('jeux-accent', accent);
    appliquerApparence();
    feuille.querySelectorAll('[data-action="accent"]').forEach(bouton => bouton.setAttribute('aria-pressed', bouton === cible));
    return;
  }
  if (id === 'retourner') {
    revelee = !revelee;
    afficher();
    app.querySelector('.carte')?.focus({ preventScroll: true });
    if (!mouvementReduit.matches) app.querySelector('.carte')?.animate(
      [{ transform: revelee ? 'rotateY(0)' : 'rotateY(180deg)' }, { transform: revelee ? 'rotateY(180deg)' : 'rotateY(0)' }],
      { duration: 500, easing: 'ease-in-out' });
    return;
  }
  if (id === 'son') {
    son = !son;
    if (son) {
      const partie = etat.partie;
      if (partie) {
        const depuis = partie.annonceDepuis ?? Math.max(0, partie.annonces.length - 1);
        file.push(...annoncesSonores(partie.annonces, depuis));
      } else file.push(null);
      pisteSuivante();
    } else stopperNarration();
    afficher();
    return;
  }
  if (id === 'oublier') {
    delete connus[cible.dataset.code];
    sauvegarde.oublier(cleSession(cible.dataset.code));
    sauvegarde.ecrire(cleSalons, JSON.stringify(connus));
    afficher();
    return;
  }
  executer(cible, async () => {
    if (id === 'demo') {
      const session = await requete('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      fermerFeuille(false);
      enregistrer(session);
      zone = 'partie';
      actualiser(await api('etat', {}));
      return;
    }
    if (id === 'essayer-son') {
      const form = cible.closest('form');
      const lecteurTest = form.querySelector('[data-lecteur-son]');
      lecteurTest.src = `/audio/${encodeURIComponent(form.elements.mp3.value || form.elements.evenement.value + '.mp3')}`;
      reglerVolume(lecteurTest, Number(form.elements.volume.value));
      lecteurTest.hidden = false;
      await lecteurTest.play();
      return;
    }
    if (['pause', 'reprendre', 'passer', 'prolonger'].includes(id)) {
      actualiser(await api(id, {}));
      return;
    }
    if (id === 'sortir') return sortir();
    if (id === 'copier') return copier(cible.dataset.url);
    if (id === 'reprise') {
      const champ = feuille.querySelector('[name="code"]');
      const salle = champ ? champ.value.toUpperCase() : code;
      if (!codeValide.test(salle)) throw new Error('Saisis le code du salon pour retrouver ta place.');
      if (reprise && code === salle) ouvrirFeuille('reprise');
      else {
        const { joueurs } = await api('joueurs', undefined, null, salle);
        code = salle;
        reprise = null;
        ouvrirFeuille('reprise', joueurs);
      }
      return;
    }
    if (id === 'agir') actualiser(await api('agir', { numero: Number(cible.dataset.numero), choix: cible.dataset.choix ?? null }));
    if (id === 'decision') actualiser(await api('decision', { id: cible.dataset.id, accepte: cible.dataset.accepte === 'oui' }));
    if (id === 'lancer' || id === 'retour') actualiser(await api(id, {}));
  });
});

afficher();
synchroniser();
actualiserListe();
if (zone === 'admin') chargerAdmin();
setInterval(actualiserCompteur, 250);
setInterval(() => {
  if (document.hidden) return;
  synchroniser();
  if (['accueil', 'salons'].includes(zone) && Date.now() - actualiseLe > 10_000) actualiserListe();
  if (zone === 'admin' && maintenanceEnCours() && !envoi) chargerAdmin();
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    synchroniser();
    if (['accueil', 'salons'].includes(zone)) actualiserListe();
  }
});
