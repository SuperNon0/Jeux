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
  cupidon: { nom: 'Cupidon', camp: 'Village', pouvoir: 'La première nuit, lie deux personnes, toi compris si tu le veux. Si l’une meurt, l’autre meurt de chagrin. Un couple formé d’un loup et d’un membre du village gagne s’il reste seul en vie.' },
  salvateur: { nom: 'Salvateur', camp: 'Village', pouvoir: 'Protège une personne de l’attaque des loups, toi compris. D’une nuit à la suivante, choisis une personne différente ou passe ton tour.' },
  ancien: { nom: 'Ancien', camp: 'Village', pouvoir: 'Tu survis à la première attaque des loups qui te touche. Le poison et le vote peuvent t’éliminer dès la première fois.' },
  corbeau: { nom: 'Corbeau', camp: 'Village', pouvoir: 'Chaque nuit, désigne une autre personne. Elle reçoit deux voix contre elle au premier tour du prochain vote d’élimination si elle survit à la nuit.' },
};
const rolesClassiques = ['voyante', 'sorciere', 'chasseur'];
const rolesOptionnels = [...rolesClassiques, 'cupidon', 'salvateur', 'ancien', 'corbeau'];
const phases = {
  distribution: ['Distribution', 'Découvre ton rôle', 'Retourne ta carte à l’abri des regards, puis indique que tu es prêt.', 'layers'],
  lancement: ['Distribution', 'Tout le monde est prêt', 'L’hôte lance la partie quand la table est prête.', 'play'],
  compteARebours: ['Distribution', 'La partie commence', 'Le compte à rebours est partagé sur tous les téléphones.', 'clock'],
  nuit: ['Nuit', 'Le village dort', 'Les personnes appelées agissent sur leur téléphone. La suite s’affichera ici.', 'moon'],
  cupidon: ['Nuit', 'Forme un couple', roles.cupidon.pouvoir, 'heart'],
  voyante: ['Nuit', 'Découvre un rôle', 'Touche un joueur pour révéler sa carte. Tu pourras la revoir dans ton journal privé.', 'eye'],
  salvateur: ['Nuit', 'Choisis qui protéger', roles.salvateur.pouvoir, 'shield'],
  loups: ['Nuit', 'Choisissez votre cible', 'Vote pour la personne que ta meute attaquera cette nuit.', 'moon'],
  sorciere: ['Nuit', 'Choisis tes potions', 'Tu peux garder tes potions pour une autre nuit.', 'sparkle'],
  corbeau: ['Nuit', 'Choisis qui marquer', roles.corbeau.pouvoir, 'moon'],
  debat: ['Jour', 'Le village débat', 'Discutez à voix haute. L’hôte ouvre le vote quand tout le monde est prêt.', 'chat'],
  election: ['Élection', 'Élisez le maire', 'Le maire a une voix double lors des votes d’élimination et départage les égalités.', 'star'],
  egaliteElection: ['Élection', 'Égalité à l’élection', 'L’hôte peut relancer le vote ou tirer au sort parmi les personnes à égalité.', 'dice'],
  vote: ['Vote', 'Choisissez qui éliminer', 'Chaque personne encore en jeu vote en privé.', 'list'],
  attenteNuit: ['Résultat du vote', 'Le vote est terminé', 'L’hôte confirme le passage à la nuit après le résultat.', 'check'],
  egaliteVote: ['Vote', 'Une égalité persiste', 'L’hôte peut relancer le vote ou tirer au sort parmi les personnes à égalité.', 'dice'],
  departage: ['Vote', 'Le maire départage', 'Le maire choisit parmi les personnes arrivées en tête.', 'star'],
  chasseur: ['Dernier pouvoir', 'Le dernier tir', 'Le Chasseur choisit une personne à emporter.', 'shield'],
  succession: ['Mairie', 'Transmets le titre', 'Le maire éliminé désigne son successeur parmi les survivants.', 'star'],
};
const statuts = { ouvert: ['Salon ouvert', 'users'], 'en-cours': ['En cours', 'play'], pause: ['En pause', 'clock'],
  terminee: ['Terminée', 'check'], cloturee: ['Clôturé', 'lock'], expire: ['Salon indisponible', 'alert'], aRecuperer: ['Place à reprendre', 'rotate'] };
const accents = { lavande: 'Lavande', menthe: 'Menthe', or: 'Or', ambre: 'Ambre', corail: 'Corail' };
const codeValide = /^[A-HJ-NP-Z2-9]{6}$/;
const cleSession = code => `jeux-session-${code}`;
const cleSalons = 'jeux-salons';
const cleFavoris = 'jeux-compositions';
const hebergement = await fetch('/api/configuration', { signal: AbortSignal.timeout(5000) })
  .then(reponse => reponse.ok ? reponse.json() : {}).catch(() => ({}));
const enInvite = hebergement.mode === 'invite';
const enHote = hebergement.mode === 'hote';
let compositionsPartagees = hebergement.compositions ?? [];
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
let tiragePartie, minuterieTirage;
let decalageHorloge = 0;
let configurationSon = hebergement.son ?? { volume: 100, associations: {} };
let contexteAudio;
const gainsAudio = new WeakMap();
let choixCible = { numero: undefined, valeur: null };
let son = false, lecture = false, dernierSon = 0, piste = 0, file = [];
let reprendrePiste, minuterieSon;
let prochainSon = 0;
let declarationNarration = Promise.resolve();
const delaiEntreAnnonces = 2000;
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
const interfaceJoueur = () => Boolean(etat?.partie && !etat.anime && !enHote);

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
  clearTimeout(minuterieSon);
  minuterieSon = null;
  prochainSon = 0;
  piste++;
  lecteur.pause();
  lecture = false;
  file = [];
}

function annoncesSonores(partie, depuis) {
  return (partie?.annonces ?? []).filter(a => a.id > depuis && /^[a-z-]+$/.test(a.fichier ?? ''))
    .map(a => ({ id: a.id, fichier: a.fichier, partieId: partie.id }));
}

function declarerNarration(active) {
  const salle = code;
  const acces = token;
  declarationNarration = declarationNarration.then(() => api('narration', { active }, acces, salle))
    .catch(() => {
      if (salle === code && acces === token) afficherAvis('Le serveur n’a pas pu synchroniser la narration.', 4500);
    });
}

function pisteSuivante() {
  if (!son || lecture || !file.length || minuterieSon || (etat?.partie?.pause && file[0] !== null)) return;
  const attente = prochainSon - performance.now();
  if (attente > 0) {
    minuterieSon = setTimeout(() => { minuterieSon = null; pisteSuivante(); }, attente);
    return;
  }
  const id = ++piste;
  const annonce = file.shift();
  const evenement = annonce?.fichier;
  const fichier = evenement ? configurationSon.associations[evenement] ?? `${evenement}.mp3` : null;
  lecture = true;
  reglerVolume(lecteur, configurationSon.volume);
  lecteur.src = fichier ? `/audio/${encodeURIComponent(fichier)}` : silence;
  lecteur.onplaying = () => {
    if (id === piste && lecture && annonce) signalerAnnonce(true);
  };
  lecteur.onended = () => terminer();
  lecteur.onerror = () => terminer(true);
  reprendrePiste = () => lecteur.play().catch(erreurLecture => {
    if (id !== piste || !lecture || (etat?.partie?.pause && erreurLecture.name === 'AbortError')) return;
    if (erreurLecture.name === 'NotAllowedError') {
      son = false;
      stopperNarration();
      declarerNarration(false);
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
    if (echec && fichier && etat?.partie?.narrationObligatoire) {
      son = false;
      stopperNarration();
      declarerNarration(false);
      return;
    }
    if (fichier && !echec) prochainSon = performance.now() + delaiEntreAnnonces;
    if (annonce) signalerAnnonce(false);
    pisteSuivante();
  }

  function signalerAnnonce(lecture) {
    if (annonce.partieId === etat?.partie?.id) {
      declarationNarration.then(() => api('chronometre', { annonce: annonce.id, partieId: annonce.partieId, lecture })).catch(() => {});
    }
  }
}

function actualiser(nouveau) {
  if (nouveau.son) configurationSon = nouveau.son;
  decalageHorloge = (nouveau.horloge ?? Date.now()) - Date.now();
  if (!etat && nouveau.hote && !son) declarerNarration(false);
  const precedente = etat?.partie;
  const partie = nouveau.partie;
  if (precedente?.id !== partie?.id) {
    revelee = false;
    clearTimeout(minuterieTirage);
    tiragePartie = null;
    choixCible = { numero: undefined, valeur: null };
    dernierSon = 0;
    if (precedente && !precedente.gagnant) stopperNarration();
    if (partie) {
      const distribution = partie.phase === 'distribution' && !partie.aRepondu;
      zone = distribution ? 'carte' : 'partie';
      if (distribution && !mouvementReduit.matches) {
        tiragePartie = partie.id;
        minuterieTirage = setTimeout(() => { tiragePartie = null; afficher(); }, 1050);
      }
    }
    if (!partie && ['carte', 'journal'].includes(zone)) zone = 'partie';
  }
  if (precedente?.phase === 'distribution' && zone === 'carte' &&
      (partie?.phase === 'lancement' || (precedente.action && partie?.aRepondu))) zone = 'partie';
  const annonces = partie?.annonces ?? [];
  const recentes = annonces.filter(a => a.id > dernierSon);
  const revelation = precedente && precedente.id === partie?.id && partie.historique.length > precedente.historique.length
    ? partie.historique.at(-1) : null;
  etat = nouveau;
  if (nouveau.hote && partie?.pause === 'son' && precedente?.pause !== 'son' && son) {
    son = false;
    stopperNarration();
  }
  if (son && nouveau.hote) {
    file.push(...annoncesSonores(partie, dernierSon));
    if (partie?.pause) {
      if (!precedente?.pause && lecture) lecteur.pause();
    } else if (lecture && precedente?.pause) reprendrePiste?.();
    else pisteSuivante();
  }
  const maire = precedente?.id === partie?.id && recentes.findLast(a => ['maire-elu', 'nouveau-maire'].includes(a.fichier));
  if (maire && !interfaceJoueur() && !partie?.attendAnnonce) {
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
      if (incident.status === 404) {
        code = '';
        history.replaceState(history.state, '', '/');
      }
      if (zone !== 'admin') zone = 'accueil';
      son = false;
      stopperNarration();
      afficher();
    }
    if (reprise && [400, 404, 410].includes(incident.status)) {
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
  if (interfaceJoueur()) return ['partie', 'carte', 'plus'];
  const liens = etat ? etat.partie ? ['partie', 'carte', 'journal'] : ['partie', 'salons'] : ['accueil', 'salons'];
  return [...liens, ...(enHote ? ['admin'] : []), 'plus'];
}

function rendreNavigation() {
  document.body.classList.toggle('joueur-simple', interfaceJoueur());
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
  const demo = enHote ? action('Essayer la démo', 'play', 'demo', 'sur-image') : '';
  const lien = code ? `Invitation au salon <strong>${code}</strong>.` : 'Une carte et des votes privés sur chaque téléphone.';
  const actifs = Object.values(connus).filter(s => s && !['expire', 'cloturee'].includes(s.statut))
    .sort((a, b) => (b.activite ?? 0) - (a.activite ?? 0));
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
  const actionBot = j.bot && !p && etat.hote ? action('<span class="sr">Retirer le bot</span>', 'x', 'retirer-bot', 'ico gh',
    `aria-label="Retirer ${echapper(j.nom)}" data-id="${j.id}"`) : '';
  return `<li class="joueur ${vivant ? '' : 'elimine'}"><span class="avatar">${echapper(initiales(j.nom))}</span>
    <div><strong>${echapper(j.nom)}${j.id === etat.joueur ? ' <small>· Toi</small>' : ''}</strong>
    <small class="muted">${[j.id === etat.hoteId ? 'Hôte' : j.id === etat.cohoteId ? 'Co-hôte' : '', role ? roles[role].nom : vivant ? j.bot ? 'Joueur simulé' : j.enLigne ? 'En ligne' : 'Hors ligne' : 'Éliminé'].filter(Boolean).join(' · ')}</small></div>
    ${actionBot || (p?.maire === j.id ? medaille : `<span class="point ${j.enLigne && vivant ? 'connecte' : ''}" aria-hidden="true"></span>`)}</li>`;
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
  if (etat.resume.statut === 'cloturee') {
    return `${entetePage('Salon clôturé', `Salon <span class="mono">${code}</span>`)}
      <section class="panneau pile"><p>L’administration a terminé cette partie.</p>
        <div class="actions">${action('Mes salons', 'users', 'liste', 'pri')}${action('Quitter l’écran', 'logout', 'sortir', 'gh')}</div>
      </section>`;
  }
  const complet = etat.joueurs.length === etat.total && etat.joueurs.every(j => j.enLigne);
  const aDesInvites = etat.joueurs.some(j => !j.bot && j.id !== etat.hoteId);
  return `${entetePage('Salon', etat.hote ? 'Invite les joueurs, puis lance la partie.' : 'La partie démarre quand l’hôte est prêt.',
      action('Quitter l’écran', 'logout', 'sortir', 'gh'))}
    <div class="grille-partie grille-salon">
      <section class="panneau panneau-invitation"><h2 class="ttl">Inviter des amis ${aide('qr', 'Invitation', 'Les joueurs scannent le QR ou ouvrent le lien sur leur téléphone. Une personne qui a perdu son accès peut demander à reprendre son pseudo.')}</h2>${invitation()}</section>
      <section class="panneau commandes-salon panneau-lancer">
         <div><h2 class="ttl">Distribution des cartes</h2><p class="soft">${!complet ? 'Toutes les places doivent être occupées et en ligne.' : etat.hote ? 'Tout le monde est là.' : 'En attente de l’hôte.'}</p></div>
         ${etat.hote ? `<div class="actions">${boutonSon()}${action('Tirer les cartes', 'layers', 'lancer', 'pri', complet ? '' : 'disabled')}
           ${etat.joueurs.length < etat.total ? action('Ajouter un bot', 'plus', 'ajouter-bot', 'gh') : ''}
           ${aDesInvites ? action('Co-hôte', 'users', 'cohote', 'gh') : ''}</div>` : ''}
      </section>
      ${panneauJoueurs()}
      <section class="panneau panneau-composition"><h2 class="ttl">Composition</h2><div class="composition">${Object.entries(etat.config.composition)
        .filter(([, n]) => n).map(([id, n]) => `<span>${roles[id].nom} <b class="mono">×${n}</b></span>`).join('')}</div>
      <p class="soft">Maire ${etat.config.maire ? 'activé' : 'désactivé'} · Narration ${etat.config.discret ? 'discrète' : 'classique'}</p></section>
    </div>`;
}

const jourPhases = new Set(['debat', 'election', 'egaliteElection', 'vote', 'attenteNuit', 'departage', 'egaliteVote', 'succession', 'chasseur']);

function etapes(p) {
  const phase = ['distribution', 'lancement', 'compteARebours'].includes(p.phase) ? 'carte' : p.phase === 'fin' ? 'fin' : jourPhases.has(p.phase) ? 'jour' : 'nuit';
  return `<ol class="etapes" aria-label="Phase de jeu">${[
    ['carte', 'layers', 'Cartes'], ['nuit', 'moon', 'Nuit'], ['jour', 'sun', 'Jour'], ['fin', 'star', 'Résultat'],
  ].map(([id, ic, titre]) => `<li ${id === phase ? 'aria-current="step"' : ''}>${icone(ic, 18)}${titre}</li>`).join('')}</ol>`;
}

function choixJoueurs(p) {
  if (choixCible.numero !== p.numero) choixCible = { numero: p.numero, valeur: null };
  const textes = { salvateur: 'Protéger', corbeau: 'Marquer', loups: 'Confirmer la cible', election: 'Envoyer mon vote',
    vote: 'Envoyer mon vote', departage: 'Confirmer le départage', chasseur: 'Confirmer le tir', succession: 'Désigner le maire' };
  return `<form data-form="cible" data-numero="${p.numero}">
    <fieldset class="liste-cibles"><legend class="sr">Joueurs disponibles</legend>${p.action.cibles.map(id => `
      <label class="cible"><input type="radio" required name="cible" value="${id}" ${choixCible.valeur === id ? 'checked' : ''}>
      <span class="avatar">${echapper(initiales(etiquette(id)))}</span><strong>${echapper(etiquette(id))}${id === etat.joueur ? ' <small>· Toi</small>' : ''}</strong>
      ${p.maire === id ? medaille : ''}
      ${p.phase === 'vote' && p.marqueCorbeau === id ? '<small class="muted">+2 voix contre</small>' : ''}</label>`).join('')}</fieldset>
    <div class="actions"><button class="btn pri" data-envoi>${icone('check', 18)}${textes[p.phase]}</button>
    ${p.phase === 'salvateur' ? action('Passer cette nuit', 'chev', 'agir', 'gh', `data-envoi data-numero="${p.numero}"`) : ''}</div></form>`;
}

function choixCupidon(p) {
  const cibles = p.action.cibles.map(id => `<option value="${id}">${echapper(etiquette(id))}${id === etat.joueur ? ' · Toi' : ''}</option>`).join('');
  return `<form data-form="cupidon" data-numero="${p.numero}">
    <label class="champ-jeu">Première personne<select name="premier" required><option value="">Choisir…</option>${cibles}</select></label>
    <label class="champ-jeu">Deuxième personne<select name="second" required><option value="">Choisir…</option>${cibles}</select></label>
    <button class="btn pri" data-envoi>${icone('heart', 18)}Lier le couple</button>
  </form>`;
}

function verifierCouple(form) {
  const { premier, second } = form.elements;
  second.setCustomValidity(second.value && premier.value === second.value ? 'Choisis deux personnes différentes.' : '');
}

function lienAmoureux(p) {
  return p.amoureux ? `<p class="notice">${icone('heart', 18)}<span>Tu es lié à <strong>${echapper(p.amoureux)}</strong>.</span></p>` : '';
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
      : p.phase === 'nuit' ? 'Ton téléphone t’indiquera si tu dois agir.'
      : p.phase === 'attenteNuit' ? 'En attente de la confirmation de l’hôte.' : 'En attente des autres joueurs.';
    return `<p class="notice attente">${icone(p.aRepondu ? 'check' : sorti ? 'eye' : 'hourglass', 18)}${message}</p>`;
  }
  const agir = (texte, ic, classe = 'pri', choix = '') => action(texte, ic, 'agir', classe, `data-envoi data-numero="${p.numero}" ${choix ? `data-choix="${choix}"` : ''}`);
  if (p.phase === 'distribution') {
    return action('Voir ma carte', 'eye', 'ouvrir-carte', 'pri');
  }
  if (p.phase === 'lancement') return agir('Lancer la partie', 'play');
  if (p.phase === 'voyante') return p.action.revelationAttendue ? boutonRevelation(p) : ciblesVoyante(p);
  if (p.phase === 'cupidon') return choixCupidon(p);
  if (p.phase === 'debat') return agir('Ouvrir le vote', 'arrow');
  if (p.phase === 'attenteNuit') return agir('Confirmer et lancer la nuit', 'moon');
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
  return `<section class="panneau carte-zone ${p.phase === 'distribution' ? 'carte-distribuee' : ''}">
    <div class="titre-bloc"><h2 class="ttl">Ta carte</h2>${pastille('Privée', 'lock')}</div>
    <button type="button" class="carte ${revelee ? 'revelee' : ''}" data-action="retourner" aria-pressed="${revelee}"
      aria-label="${revelee ? 'Cacher ma carte' : 'Retourner ma carte'}">
      <span class="face dos">${art('dos')}</span><span class="face recto">${art(p.role)}</span>
    </button>
    <div class="detail-carte" id="detail-carte">${detailCarte(p)}</div>
    ${lienAmoureux(p)}
    ${p.action && p.phase === 'distribution' && revelee ? action('Je suis prêt', 'check', 'agir', 'pri', `data-numero="${p.numero}" data-envoi`) : ''}
  </section>`;

  function detailCarte(p) {
    if (!revelee) return '<p class="soft">Touche la carte pour révéler ton rôle.</p>';
    return `<h3 class="ttl">${role.nom}</h3><p class="soft">${role.pouvoir}</p>
      ${p.allies.length ? `<p class="soft">Ta meute · ${p.allies.map(echapper).join(', ')}</p>` : ''}`;
  }
}

function vuePhase(p) {
  if (p.pause === 'son') {
    return `<section class="panneau phase phase-annonce">
      <div class="phase-entete"><span class="embleme">${icone('bell', 24)}</span>
      <h2 class="ttl">En attente du son de l’hôte</h2></div>
      ${etat.hote ? boutonSon() : ''}
    </section>`;
  }
  if (p.attendAnnonce) {
    return `<section class="panneau phase phase-annonce">
      <div class="phase-entete"><span class="embleme">${icone(p.pause ? 'clock' : 'bell', 24)}</span><div>
        <span class="lbl-mono">Narration</span><h2 class="ttl" aria-live="polite">${echapper(p.sousTitre || 'En attente de l’annonce')}</h2>
      </div></div>
      ${p.pause ? '<p class="notice">Partie en pause</p>' : ''}
      ${etat.anime ? `<div class="actions">${action(p.pause ? 'Reprendre' : 'Mettre en pause',
        p.pause ? 'play' : 'clock', p.pause ? 'reprendre' : 'pause', 'gh')}</div>` : ''}
    </section>`;
  }
  if (p.phase === 'compteARebours') {
    return `<section class="panneau phase compte-lancement">
      <h2 class="ttl">La partie commence</h2><time class="mono" data-temps role="timer">0:10</time>
      ${p.pause ? `<p>Partie en pause</p>${etat.anime ? action('Reprendre', 'play', 'reprendre', 'gh') : ''}` : ''}
    </section>`;
  }
  if (p.phase === 'fin') {
    const victoire = { village: 'Le village l’emporte', loups: 'La meute l’emporte',
      amoureux: 'Les amoureux l’emportent', egalite: 'Aucun camp ne survit' }[p.gagnant];
    const resultat = p.gagnant === 'amoureux' ? p.vivants.map(etiquette).map(echapper).join(' et ') : '';
    return afficheScene('scene-jour resultat', `<h2 class="ttl">${victoire}</h2>`,
      resultat || 'Les rôles de tous les joueurs sont révélés.',
      etat.hote ? action(etat.demo ? 'Recommencer la démo' : 'Retour au salon', 'rotate', 'retour', 'pri') : '', `<span class="scene-etiquette">${icone('star', 16)}Partie terminée</span>`);
  }
  const [label, titre, texte, ic] = phases[p.phase];
  const progression = p.progression;
  const bulletinSimple = interfaceJoueur() && p.phase === 'vote' && p.action;
  const derniere = p.annonces.findLast(a => a.message && (p.phase === 'debat' ? a.fichier?.startsWith('nuit-') :
    p.phase === 'vote' ? ['maire-elu', 'nouveau-maire'].includes(a.fichier) :
    p.phase === 'attenteNuit' ? ['resultat-vote', 'aucun-vote-elimination'].includes(a.fichier) : false));
  const ancien = p.phase === 'debat'
    ? p.annonces.slice(p.annonces.findLastIndex(a => a.fichier === 'le-village-se-reveille')).find(a => a.fichier === 'ancien-survit')
    : null;
  const animateurPresent = etat.joueurs.some(j => j.enLigne && [etat.hoteId, etat.cohoteId].includes(j.id));
  return `<section class="panneau phase">
    <div class="phase-entete"><span class="embleme">${icone(ic, 24)}</span><div>
      <span class="lbl-mono">${label}</span><h2 class="ttl">${titre} ${aide('phase', titre, texte)}</h2></div>
    </div>
    ${derniere && !bulletinSimple ? `<div class="notice">${icone('list', 16)}${echapper(derniere.message)}</div>` : ''}
    ${ancien ? `<div class="notice">${icone('shield', 16)}${echapper(ancien.message)}</div>` : ''}
    ${p.marqueCorbeau && !bulletinSimple ? `<div class="notice">${icone('list', 16)}${echapper(etiquette(p.marqueCorbeau))} reçoit deux voix au premier vote d’élimination.</div>` : ''}
    ${lienAmoureux(p)}
    ${progression ? `<div class="progression"><div><span>${p.phase === 'distribution' ? 'Joueurs prêts' : 'Votes reçus'}</span>
      <strong class="mono">${progression.reponses}/${progression.total}</strong></div>
      <progress value="${progression.reponses}" max="${progression.total}" aria-label="${p.phase === 'distribution' ? 'Joueurs prêts' : 'Votes reçus'}"></progress></div>` : ''}
    ${p.pause ? `<p class="notice">${icone('clock', 18)}Partie en pause</p>` : ''}
    ${!animateurPresent ? `<p class="notice avertissement">${icone('alert', 18)}Le salon attend un animateur.</p>` : ''}
    ${commandes(p)}
    ${p.action?.revelationAttendue ? '' : boutonRevelation(p)}
    ${p.phase === 'distribution' && etat.hote ? boutonSon() : ''}
    ${etat.anime ? `<div class="actions commandes-phase">
      ${action(p.pause ? 'Reprendre' : 'Mettre en pause', p.pause ? 'play' : 'clock', p.pause ? 'reprendre' : 'pause', 'gh')}
      ${p.peutProlonger ? action('+30 s de débat', 'plus', 'prolonger', 'gh') : ''}
      ${p.peutPasser ? action('Passer les absents', 'chev', 'passer', 'gh') + aide('absents', 'Actions des absents', 'Après 15 secondes, tu peux passer les actions des personnes hors ligne. Leurs votes manquants comptent comme des abstentions.') : ''}
    </div>` : ''}</section>`;
}

function chronos(p) {
  if (['distribution', 'lancement', 'compteARebours'].includes(p.phase)) return '';
  const label = p.phase === 'debat' ? 'Temps de parole' : p.phase === 'election' ? 'Élection' : p.phase === 'vote' ? 'Temps de vote'
    : p.temps?.choix ? 'Temps de choix' : '';
  return `<div class="chronos" aria-label="Chronomètres">
    <div class="chrono">${icone('clock', 18)}<span>Partie</span><time class="mono" data-temps-total role="timer">0:00</time></div>
    ${label && !p.attendAnnonce ? `<div class="chrono chrono-phase">${icone(p.phase === 'debat' ? 'chat' : p.temps?.choix ? 'hourglass' : 'list', 18)}<span>${label}</span>
       <time class="mono" data-temps role="timer">${p.temps?.attente ? 'Après l’annonce' : p.temps ? '–' : 'Sans limite'}</time></div>` : ''}
  </div>`;
}

function partie() {
  const p = etat.partie;
  if (p.phase === 'distribution' && tiragePartie === p.id && ['partie', 'carte'].includes(zone)) {
    return `<section class="panneau carte-zone carte-distribuee" aria-labelledby="titre-tirage">
      <h1 id="titre-tirage" class="ttl">Tirage des cartes</h1>
      <div class="tirage-cartes" aria-hidden="true">${art('dos')}${art('dos')}${art('dos')}</div>
    </section>`;
  }
  const contenu = zone === 'carte' ? carte(p) : zone === 'journal' ? journal(p) : vuePhase(p);
  if (zone === 'carte' && p.phase === 'distribution') return contenu;
  if (interfaceJoueur()) {
    return `${entetePage(zones[zone][0], p.jour ? `Tour ${p.jour}` : '')}
      ${chronos(p)}
      <div class="pile joueur-partie">${contenu}
      ${zone === 'partie' && !p.attendAnnonce && !['distribution', 'compteARebours'].includes(p.phase) ? `<details class="panneau" id="joueurs-repliables" ${p.phase === 'fin' ? 'open' : ''}>
        <summary>${p.phase === 'fin' ? 'Résultat et rôles' : 'Joueurs'} ${icone('chevd', 16)}</summary>${panneauJoueurs(p)}</details>` : ''}
      </div>`;
  }
  return `${entetePage(etat.demo && zone === 'partie' ? 'Démo' : zones[zone][0],
      `${etat.demo ? 'Quatre joueurs simulés' : `Salon <span class="mono">${code}</span>`}${p.jour ? ` · Tour ${p.jour}` : ''}`,
      action('Options du salon', 'dots', 'plus', 'gh'))}
    ${chronos(p)}
    ${p.attendAnnonce ? '' : etapes(p)}
    <div class="grille-partie"><div class="pile">
      ${contenu}
    </div><div class="pile">${p.attendAnnonce ? '' : panneauJoueurs(p)}
      ${etat.hote && p.pause !== 'son' && (p.phase !== 'distribution' || zone !== 'partie') ? `<section class="panneau commandes-salon"><div><h2 class="ttl">Narration ${aide('narration', 'Narration', 'Les annonces sont diffusées sur le téléphone de l’hôte.')}</h2></div>${boutonSon()}</section>` : ''}
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
    compositionsPartagees = donneesAdmin.compositions ?? compositionsPartagees;
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
      <div class="titre-bloc"><h2 class="ttl">Tous les salons ${aide('tous-salons', 'Tous les salons', 'Terminer ferme le salon et le garde dans ce tableau. Supprimer le retire définitivement. Les cartes et les votes restent privés.')}</h2>${action('Actualiser', 'refresh', 'actualiser-admin', 'gh')}</div>
      ${salons.length ? `<ul class="liste-admin-salons">${salons.map(salon => {
        const [label, ic] = statuts[salon.statut];
        return `<li><div class="titre-bloc"><div><strong class="mono">${salon.code}</strong><small class="muted">${echapper(salon.hote)}
          ${salon.demo ? '· Démo ' : ''}· ${salon.joueurs}/${salon.total} places · ${salon.enLigne} en ligne${salon.jour ? ` · Tour ${salon.jour}` : ''}</small></div>
          ${pastille(label, ic, salon.statut === 'pause' ? 'pause' : '')}</div>
          <div class="actions">
            ${salon.statut === 'cloturee' ? '' : action('Terminer', 'lock', 'gerer-salon', 'gh', `data-code="${salon.code}" data-operation="terminer" aria-label="Terminer le salon ${salon.code}"`)}
            ${action('Supprimer', 'trash', 'gerer-salon', 'gh', `data-code="${salon.code}" data-operation="supprimer" aria-label="Supprimer le salon ${salon.code}"`)}
          </div></li>`;
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

function formaterChrono(secondes) {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

function actualiserCompteur() {
  const partie = etat?.partie;
  if (!partie) return;
  const maintenant = Date.now() + decalageHorloge;
  const sortie = app.querySelector('[data-temps]');
  const temps = partie.temps;
  if (sortie && temps?.echeance) {
    const restant = Math.max(0, Math.ceil((temps.echeance - (temps.pauseDepuis ?? maintenant)) / 1000));
    sortie.textContent = formaterChrono(restant);
  }
  const total = app.querySelector('[data-temps-total]');
  const chrono = partie.chronoPartie;
  if (total && chrono) {
    const duree = Math.max(0, Math.floor(((chrono.arrete ?? maintenant) - chrono.debut - chrono.suspendu) / 1000));
    total.textContent = formaterChrono(duree);
  }
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
  const formulaire = app.querySelector('[data-form="sorciere"], [data-form="cupidon"]');
  const valeurs = formulaire?.dataset.numero === String(etat?.partie?.numero) ? new FormData(formulaire) : null;
  const focusCible = focus?.name === 'cible' ? focus.value : null;
  const champActif = formulaire?.contains(focus) ? focus.name : '';
  const joueursOuverts = app.querySelector('#joueurs-repliables')?.open;
  app.innerHTML = html;
  if (joueursOuverts && app.querySelector('#joueurs-repliables')) app.querySelector('#joueurs-repliables').open = true;
  renduPage = html;
  actualiserCompteur();
  if (valeurs) {
    const nouveauFormulaire = app.querySelector(`[data-form="${formulaire.dataset.form}"]`);
    if (nouveauFormulaire) {
      for (const [nom, valeur] of valeurs) {
        const champ = nouveauFormulaire.elements.namedItem(nom);
        if (!champ) continue;
        if (champ.type === 'checkbox') champ.checked = true;
        else champ.value = valeur;
      }
      if (nouveauFormulaire.dataset.form === 'cupidon') verifierCouple(nouveauFormulaire);
      if (champActif) nouveauFormulaire.elements.namedItem(champActif)?.focus({ preventScroll: true });
    }
  }
  if (focusCible) {
    [...app.querySelectorAll('input[name="cible"]')].find(c => c.value === focusCible)?.focus({ preventScroll: true });
  }
}

const dureesSalon = [
  { champ: 'debatMinutes', cle: 'debatSecondes', libelle: 'Débat', defaut: 120 },
  { champ: 'voteMinutes', cle: 'voteSecondes', libelle: 'Votes', defaut: 60 },
  { champ: 'roleMinutes', cle: 'roleSecondes', libelle: 'Choix des rôles', defaut: 60 },
];
const minutesSalon = secondes => Number((Number(secondes) / 60).toFixed(6));

function sectionCreation(titre, picto, contenu) {
  return `<details class="avances creation-section"><summary>
    <span class="creation-picto">${icone(picto, 17)}</span><span>${titre}</span>${icone('chevd', 16)}
  </summary><div class="creation-corps">${contenu}</div></details>`;
}

const formCreation = () => `<form data-form="creer">
  <div class="creation-contenu">
    <div class="creation-identite">
      ${pseudo}
      <label class="champ-jeu">Nombre de joueurs <select name="total">${Array.from({ length: 12 }, (_, i) => i + 5)
        .map(n => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${n} joueurs</option>`).join('')}</select></label>
    </div>
    <label class="champ-jeu">Composition rapide<select name="preset">${optionsComposition()}</select></label>
    <div class="ligne-option creation-maire"><span class="creation-picto">${icone('star', 17)}</span>
      <label class="case"><input type="checkbox" name="maire" checked>Élection du maire</label>
      ${aide('creation-maire', 'Élection du maire', 'Le village élit son maire à la fin du premier débat. Sa voix compte double lors des votes d’élimination et il tranche les égalités.')}</div>
    <div class="creation-sections">
      ${sectionCreation('Personnaliser les règles', 'layers', `
        <div class="creation-nuit">
          <label class="champ-jeu">Loups-Garous<input type="number" name="loups" min="1" max="2" value="1" required></label>
          <div class="ligne-option"><label class="case"><input type="checkbox" name="discret">Appels de nuit discrets</label>
            ${aide('creation-discret', 'Appels de nuit discrets', 'Les consignes des rôles restent visibles sur les téléphones. La narration joue les transitions communes.')}</div>
        </div>
        <fieldset class="creation-roles">
          <legend>Rôles spéciaux</legend>
          ${rolesOptionnels.map(id => `<div class="role-composition">
            <label class="role-composition-choix">${art(id)}
              <input type="checkbox" name="${id}" ${rolesClassiques.includes(id) ? 'checked' : ''}>
              <span class="role-composition-nom">${roles[id].nom}</span>
            </label>
            ${aide(`composition-${id}`, roles[id].nom, roles[id].pouvoir)}
          </div>`).join('')}
        </fieldset>
        <div class="creation-ordre">
          <label class="champ-jeu">Ordre de nuit<select name="ordre" aria-describedby="ordre-actif">
            <option value="voyante,loups,sorciere">Ordre classique</option>
            <option value="loups,voyante,sorciere">Loups avant la Voyante</option>
            <option value="loups,sorciere,voyante">Voyante après la Sorcière</option>
          </select></label>
          <ol id="ordre-actif" class="ordre-actif" aria-label="Ordre de passage des rôles" aria-live="polite"></ol>
        </div>`)}
      ${sectionCreation('Chronomètres', 'clock', `
        <div class="creation-temps">${dureesSalon.map(({ champ, libelle, defaut }) => `<label class="champ-jeu">
          <span>${libelle} <small class="muted">(min)</small></span>
          <input name="${champ}" type="number" inputmode="decimal" min="0" max="15" step="any" value="${minutesSalon(defaut)}" required>
        </label>`).join('')}</div>
        <div class="ligne-option"><span class="soft">0 pour désactiver un chronomètre.</span>
          ${aide('chronos', 'Chronomètres', 'Entre 0,25 et 15 minutes, ou 0 pour désactiver. À la fin du délai, les votes manquants deviennent des abstentions. Un rôle sans réponse passe son tour. Pour un départage, le jeu tire au sort.')}</div>`)}
      ${enHote ? sectionCreation('Compositions partagées', 'users', `<input type="hidden" name="compositionId">
        <label class="champ-jeu">Nom de la composition partagée<input name="nomPartage" maxlength="35" placeholder="Ex. Partie du vendredi"></label>
        <div class="actions">${action('Enregistrer une composition', 'plus', 'enregistrer-composition', 'gh')}
          ${action('Mettre à jour la composition', 'check', 'enregistrer-composition', 'gh', 'data-modifier disabled')}</div>`) : ''}
      ${sectionCreation('Mes favoris', 'star', `<label class="champ-jeu">Nom de la composition<input name="favori" maxlength="35" placeholder="Ex. Partie du vendredi"></label>
        <div class="actions">${action('Enregistrer', 'star', 'favori', 'gh')}</div>`)}
    </div>
  </div>
  <div class="creation-pied">
    <p class="composition-prevision soft" id="projection" role="status"></p>
    <button class="btn pri" data-envoi>${icone('plus', 18)}Créer le salon</button>
  </div>
</form>`;

const compositions = [
  ['Petite table · 5 joueurs', 5, 1, ['voyante']],
  ['Table classique · 8 joueurs', 8, 2, rolesClassiques],
  ['Grande table · 12 joueurs', 12, 3, rolesClassiques],
  ['Village étendu · 12 joueurs', 12, 3, rolesOptionnels],
];

function optionsComposition() {
  return '<option value="">Personnalisée</option>' + compositions.map(([nom], index) =>
    `<option value="modele-${index}">${nom}</option>`).join('') +
    (compositionsPartagees.length ? `<optgroup label="Compositions partagées">${compositionsPartagees.map(({ nom }, index) =>
      `<option value="partagee-${index}">${echapper(nom)}</option>`).join('')}</optgroup>` : '') +
    favoris.map(({ nom }, index) => `<option value="favori-${index}">${echapper(nom)}</option>`).join('');
}

function ordreActif(ordre, estActif) {
  return ['cupidon', ...ordre.split(',').flatMap(id => id === 'loups' ? ['salvateur', 'loups'] : [id]), 'corbeau'].filter(estActif);
}

function lireDurees(donnees) {
  return Object.fromEntries(dureesSalon.map(({ champ, cle }) => [cle, Math.round(Number(donnees.get(champ)) * 60)]));
}

function chargerDurees(champs, reglages) {
  for (const { champ, cle, defaut } of dureesSalon) champs[champ].value = minutesSalon(reglages[cle] ?? defaut);
}

function reglageSalon(donnees) {
  const total = Number(donnees.get('total'));
  const composition = { loups: Number(donnees.get('loups')),
    ...Object.fromEntries(rolesOptionnels.map(id => [id, Number(donnees.has(id))])) };
  composition.villageois = total - Object.values(composition).reduce((a, b) => a + b, 0);
  return { total, composition, ordre: ordreActif(donnees.get('ordre'), id => composition[id]),
    maire: donnees.has('maire'), discret: donnees.has('discret'), ...lireDurees(donnees) };
}

function appliquerComposition(form) {
  const champs = form.elements;
  const selection = champs.preset.value;
  const [source, index] = selection.split('-');
  if (champs.compositionId) {
    champs.compositionId.value = '';
    champs.nomPartage.value = '';
    form.querySelector('[data-modifier]').disabled = true;
  }
  if (source === 'modele') {
    const [, total, loups, actifs] = compositions[index];
    champs.total.value = total;
    champs.loups.value = loups;
    for (const id of rolesOptionnels) champs[id].checked = actifs.includes(id);
  } else if (source === 'partagee') {
    const preset = compositionsPartagees[index];
    if (!preset) return;
    champs.total.value = preset.total;
    champs.loups.value = preset.composition.loups;
    for (const id of rolesOptionnels) champs[id].checked = Boolean(preset.composition[id]);
    champs.maire.checked = preset.maire;
    champs.discret.checked = preset.discret;
    chargerDurees(champs, preset);
    const option = [...champs.ordre.options].find(o => ordreActif(o.value, id => preset.composition[id]).join(',') === preset.ordre.join(','));
    champs.ordre.value = option?.value ?? champs.ordre.options[0].value;
    champs.compositionId.value = preset.id;
    champs.nomPartage.value = preset.nom;
    form.querySelector('[data-modifier]').disabled = false;
  } else if (source === 'favori') {
    const choix = favoris[index]?.champs;
    if (choix) {
      for (const nom of ['total', 'loups', 'ordre']) champs[nom].value = choix[nom];
      chargerDurees(champs, choix);
      for (const nom of ['maire', 'discret', ...rolesOptionnels]) champs[nom].checked = Boolean(choix[nom]);
    }
  }
}

async function enregistrerComposition(form, modifier) {
  const champs = form.elements;
  const nom = champs.nomPartage.value.trim();
  if (!nom) throw new Error('Donne un nom à cette composition.');
  for (const champ of [champs.loups, ...dureesSalon.map(({ champ }) => champs[champ])]) {
    if (!champ.reportValidity()) return;
  }
  const reglages = reglageSalon(new FormData(form));
  const resultat = await requete('/api/admin/compositions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reglages, nom, ...(modifier && { id: champs.compositionId.value }) }),
  });
  compositionsPartagees = resultat.compositions;
  champs.preset.innerHTML = optionsComposition();
  champs.preset.value = 'partagee-' + compositionsPartagees.findIndex(preset => preset.id === resultat.composition.id);
  configurer(form, 'preset');
  afficherAvis('Composition partagée enregistrée.', 4000);
}

function enregistrerFavori(form) {
  const champs = form.elements;
  const nom = champs.favori.value.trim();
  if (!nom) return afficherAvis('Donne un nom à cette composition.');
  for (const nom of ['loups', ...dureesSalon.map(({ champ }) => champ)]) {
    if (!champs[nom].reportValidity()) return;
  }
  const valeurs = lireDurees(new FormData(form));
  for (const cle of ['total', 'loups', 'ordre']) valeurs[cle] = champs[cle].value;
  for (const cle of ['maire', 'discret', ...rolesOptionnels]) valeurs[cle] = champs[cle].checked;
  favoris = [{ nom, champs: valeurs }, ...favoris.filter(favori => favori.nom !== nom)].slice(0, 16);
  sauvegarde.ecrire(cleFavoris, JSON.stringify(favoris));
  champs.preset.innerHTML = optionsComposition();
  champs.preset.value = 'favori-0';
  afficherAvis('Composition enregistrée sur cet appareil.', 4000);
}

function configurer(form, evenement) {
  const champs = form.elements;
  const { total, loups, ordre } = champs;
  if (evenement === 'preset') appliquerComposition(form);
  const taille = Number(total.value);
  if (evenement === 'total') loups.value = taille >= 12 ? 3 : taille >= 8 ? 2 : 1;
  const nombreLoups = Number(loups.value);
  const nombreSpeciaux = rolesOptionnels.filter(id => champs[id].checked).length;
  const villageois = taille - nombreLoups - nombreSpeciaux;
  loups.max = Math.floor((taille - 1) / 2);
  for (const { champ: nom } of dureesSalon) {
    const champ = form.elements[nom];
    champ.setCustomValidity(Number(champ.value) > 0 && Number(champ.value) < 0.25 ? '0,25 minute au minimum, ou 0.' : '');
  }
  loups.setCustomValidity(villageois < 0 ? 'Il y a plus de rôles que de joueurs.' : '');
  if (!ordre.value) ordre.selectedIndex = 0;
  const apercu = form.querySelector('#ordre-actif');
  const parcours = ordreActif(ordre.value, id => id === 'loups' || champs[id].checked)
    .map((id, index) => `<li><span class="mono" aria-hidden="true">${index + 1}</span>${roles[id].nom}</li>`).join('');
  if (apercu.innerHTML !== parcours) apercu.innerHTML = parcours;
  const projection = form.querySelector('#projection');
  projection.classList.toggle('dan', villageois < 0);
  projection.textContent = villageois >= 0
    ? `${nombreLoups} loup${nombreLoups > 1 ? 's' : ''} · ${nombreSpeciaux} rôle${nombreSpeciaux > 1 ? 's' : ''} spécial${nombreSpeciaux > 1 ? 's' : ''} · ${villageois} villageois`
    : `${-villageois} rôle${villageois < -1 ? 's' : ''} de trop pour ${taille} joueurs.`;
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
      ${etat.joueurs.filter(j => !j.bot && j.id !== etat.hoteId).map(j => `<option value="${j.id}" ${j.id === etat.cohoteId ? 'selected' : ''}>${echapper(j.nom)}</option>`).join('')}</select></label>
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
    case 'son-lancement': return ['Activer le son', `<div class="pile">
      <p>Les annonces seront diffusées sur ton appareil. Le jeu démarre après un compte à rebours de 10 secondes.</p>
      ${action('Activer le son et lancer', 'play', 'son-lancement', 'pri', `data-numero="${contexte}"`)}</div>`];
    case 'gerer-salon': {
      const { salle, operation } = contexte;
      const supprimer = operation === 'supprimer';
      return [supprimer ? 'Supprimer le salon' : 'Terminer le salon', `<form data-form="gerer-salon" data-code="${salle}" data-operation="${operation}">
        <p>${supprimer ? 'La suppression efface définitivement le salon et ses accès.' : 'Les joueurs ne pourront plus jouer. Le salon restera dans le panneau.'}</p>
        <button class="btn pri" data-envoi>${icone(supprimer ? 'trash' : 'lock', 18)}${supprimer ? 'Supprimer' : 'Terminer'} le salon ${salle}</button></form>`];
    }
    case 'rechercher': return ['Rechercher', recherche()];
    case 'plus': {
      const tuile = (texte, nom, id) => `<button type="button" class="qt" data-action="${id}">${icone(nom, 22)}${texte}</button>`;
      if (interfaceJoueur()) return ['Plus', `<div class="menu-plus">
        <button type="button" class="btn" data-nav="journal">${icone('list', 18)}Journal</button>
        ${action('Quitter l’écran', 'logout', 'sortir', 'gh')}</div>`];
      return ['Plus', `<div class="q-tuiles plus-t menu-plus-tuiles">
        ${tuile('Mes salons', 'users', 'liste')}${tuile('Apparence', 'palette', 'apparence')}
        ${tuile('Comment jouer', 'help', 'regles')}${tuile('Rechercher', 'search', 'rechercher')}</div>
        ${etat && etat.resume.statut !== 'cloturee' ? `<div class="menu-plus">${!etat.demo ? action('Inviter ou récupérer une place', 'share', 'invitation') : ''}
        ${etat.hote && !etat.demo && etat.joueurs.some(j => !j.bot && j.id !== etat.hoteId) ? action('Choisir un co-hôte', 'users', 'cohote') : ''}
        ${action('Quitter l’écran', 'logout', 'sortir', 'gh')}</div>` : ''}`];
    }
    case 'invitation': return ['Invitation', `<p class="soft">Scanne le QR ou partage le lien. Une personne qui a perdu sa session peut demander à reprendre sa place.</p>${invitation()}`];
    case 'reprise': return ['Reprendre ta place', reprise ? '<p class="notice">La demande a été envoyée à l’hôte.</p>' : `<form data-form="recuperer">
      <label class="champ-jeu">Ton ancien pseudo<select name="joueur" required><option value="">Choisis ton pseudo</option>
      ${(contexte ?? []).map(joueur => `<option value="${joueur.id}">${echapper(joueur.nom)}</option>`).join('')}</select></label>
      <button class="btn pri" data-envoi>${icone('rotate', 18)}Demander la reprise</button></form>`];
    case 'revelation': {
      const { nom, role } = contexte;
      const partie = etat.partie;
      const confirmation = partie.action?.revelationAttendue && partie.historique.at(-1) === contexte;
      return ['Carte révélée', `<section class="fiche-revelation">
        ${pastille('Révélation privée', 'lock')}
        <p class="soft">${echapper(nom)}</p><h3 class="ttl">${roles[role].nom}</h3>
        ${art(role)}
        <p class="soft">Camp ${roles[role].camp}</p>
        ${confirmation ? action('J’ai vu la carte', 'check', 'confirmer-revelation', 'pri', `data-numero="${partie.numero}"`)
          : action('Continuer', 'arrow', 'fermer', 'pri')}</section>`];
    }
    case 'role': {
      const role = roles[contexte];
      return [role.nom, `<div class="fiche-role">${art(contexte)}<div><p class="lbl-mono">Camp ${role.camp}</p><p>${role.pouvoir}</p></div></div>`];
    }
    case 'regles': return ['Comment jouer', `<div class="faq">
      <details open><summary>Comment rejoindre les autres ?</summary><p>Scanne le QR code de l’hôte ou saisis les six caractères du salon, puis choisis ton pseudo. Garde le même navigateur pour retrouver ta place.</p></details>
      <details><summary>Que faire le jour et la nuit ?</summary><p>La nuit, seuls les rôles appelés agissent. Le jour, discute avec les autres, puis vote sur ton téléphone. La meute gagne à la parité et le village gagne s’il élimine tous les loups. Si Cupidon a lié un loup et un membre du village, la partie continue jusqu’à la mort du couple ou sa victoire en tant que deux derniers survivants.</p></details>
      <details><summary>Que se passe-t-il si tout le monde quitte ?</summary><p>Le salon apparaît en pause dans Mes salons. Ouvre-le depuis le même navigateur pour retrouver ta place. Sur Proxmox, le salon est sauvegardé après un redémarrage. L’administration peut terminer ou supprimer le salon.</p></details>
      </div>`];
    default: return ['', ''];
  }
}

function afficherContenuFeuille(type, contexte) {
  const [titre, contenu] = contenuFeuille(type, contexte);
  feuille.dataset.type = type;
  feuille.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="tete-feuille">
    ${type === 'creer' ? `<span class="creation-illustration" aria-hidden="true">${art('nuit')}</span>` : ''}
    <h2 id="titre-feuille" class="ttl">${titre}</h2>
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
  if (event.target.form?.dataset.form === 'creer' && event.target.type === 'number') {
    configurer(event.target.form, event.target.name);
    return;
  }
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
  if (champ.form?.dataset.form === 'cupidon') verifierCouple(champ.form);
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
    if (actionForm === 'gerer-salon') {
      const { code: salle, operation } = form.dataset;
      await requete(`/api/admin/salons/${salle}/${operation}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirme: true }),
      });
      fermerFeuille();
      await chargerAdmin();
      afficherAvis(operation === 'supprimer' ? 'Salon supprimé.' : 'Salon clôturé.', 5000);
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
      let choix;
      if (actionForm === 'cible') choix = data.get('cible');
      else if (actionForm === 'cupidon') choix = [data.get('premier'), data.get('second')];
      else choix = { soin: data.has('soin'), poison: data.get('poison') || null };
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
  if (id === 'enregistrer-composition' && enHote) {
    return executer(cible, () => enregistrerComposition(cible.closest('form'), cible.hasAttribute('data-modifier')));
  }
  if (id === 'gerer-salon' && enHote) {
    const { code: salle, operation } = cible.dataset;
    if (codeValide.test(salle) && ['terminer', 'supprimer'].includes(operation)) {
      ouvrirFeuille('gerer-salon', { salle, operation });
    }
    return;
  }
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
        if (partie.pause) file.push(null);
        file.push(...annoncesSonores(partie, depuis));
      } else file.push(null);
      pisteSuivante();
    } else stopperNarration();
    declarerNarration(son);
    afficher();
    return;
  }
  if (id === 'agir' && etat?.hote && etat.partie?.phase === 'lancement' && etat.partie.narrationObligatoire &&
      (!son || !etat.partie.narrationActive)) {
    ouvrirFeuille('son-lancement', Number(cible.dataset.numero));
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
    if (id === 'son-lancement' && etat?.hote) {
      stopperNarration();
      lecteur.onplaying = lecteur.onended = lecteur.onerror = null;
      lecteur.src = silence;
      try { await lecteur.play(); }
      catch { son = false; throw new Error('Le navigateur bloque le son. Appuie à nouveau pour réessayer.'); }
      son = true;
      await declarationNarration;
      await api('narration', { active: true });
      const resultat = await api('agir', { numero: Number(cible.dataset.numero), choix: null });
      fermerFeuille();
      actualiser(resultat);
      return;
    }
    if (id === 'confirmer-revelation') {
      const resultat = await api('agir', { numero: Number(cible.dataset.numero), choix: 'confirmer' });
      fermerFeuille();
      actualiser(resultat);
      return;
    }
    if (id === 'demo' && enHote) {
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
    if (id === 'agir' || id === 'lancer') await declarationNarration;
    if (id === 'ajouter-bot' || id === 'retirer-bot') {
      actualiser(await api(id === 'ajouter-bot' ? 'ajouterbot' : 'retirerbot', { joueur: cible.dataset.id }));
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
setInterval(() => {
  actualiserCompteur();
  if (!document.hidden && etat?.partie?.attendAnnonce) synchroniser();
}, 250);
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
