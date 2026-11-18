const app = document.querySelector('#app');
const avis = document.querySelector('#avis');
const theme = document.querySelector('#theme');
const nomination = document.querySelector('#nomination');
let minuterieMaire;
const params = new URLSearchParams(location.search);
const initial = (params.get('salon') ?? '').toUpperCase();
let code = /^[A-Z2-9]{6}$/.test(initial) ? initial : '';
const stockage = code => `jeux-session-${code}`;
let token = code && localStorage.getItem(stockage(code));
let etat, reprise, erreurExpiree, minuteur, attente = false, rendu = '', onglet = 'partie', revelee = false;
let revision = 0;
let son = false, lecture = false, dernierSon = 0, file = [];
const lecteur = new Audio();
const roles = {
  villageois: ['Villageois', 'Village', 'Débats et vote pour éliminer les Loups-Garous.'],
  loups: ['Loup-Garou', 'Loups-Garous', 'Choisis une cible avec ta meute chaque nuit.'],
  voyante: ['Voyante', 'Village', 'Découvre le rôle d’une personne chaque nuit.'],
  sorciere: ['Sorcière', 'Village', 'Tu as une potion de soin et une de poison, utilisables chacune une seule fois.'],
  chasseur: ['Chasseur', 'Village', 'Si les loups ou le vote t’éliminent, choisis une personne à emporter.'],
};
const phases = {
  distribution: 'Découverte des cartes', nuit: 'Le village dort', voyante: 'Découvre un rôle', loups: 'Choisissez votre cible',
  sorciere: 'Tes potions', debat: 'Débat du village', election: 'Élection du maire', egaliteElection: 'Égalité à l’élection',
  vote: 'Vote d’élimination', departage: 'Départage du maire', chasseur: 'Dernier tir du Chasseur',
  succession: 'Succession du maire', fin: 'Fin de la partie',
};
const echapper = valeur => String(valeur ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const etiquette = id => echapper(etat.joueurs.find(j => j.id === id)?.nom);
const medaille = '<img class="medaille" src="/illustrations/medaillon-maire.png" alt="Maire">';
const montrer = message => { avis.textContent = message ?? ''; };
const doitParler = fichier => /^[a-z-]+$/.test(fichier ?? '');

function appliquerTheme(mode) {
  document.documentElement.dataset.theme = mode;
  theme.textContent = mode === 'clair' ? 'Mode sombre' : 'Mode clair';
}
appliquerTheme(localStorage.getItem('jeux-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre'));
theme.onclick = () => {
  const mode = document.documentElement.dataset.theme === 'clair' ? 'sombre' : 'clair';
  localStorage.setItem('jeux-theme', mode);
  appliquerTheme(mode);
};

async function api(action, data, identifiant = token) {
  const base = '/api/salons';
  const url = action ? `${base}/${code}/${action}` : base;
  const options = data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(identifiant && { Authorization: `Bearer ${identifiant}` }) },
    body: JSON.stringify(data),
  };
  const reponse = await fetch(url, options);
  const result = await reponse.json();
  if (!reponse.ok) throw Object.assign(new Error(result.erreur), { status: reponse.status });
  return result;
}

function enregistrer(session) {
  code = session.code;
  token = session.token;
  localStorage.setItem(stockage(code), token);
  history.replaceState(null, '', `?salon=${code}`);
}

function actualiser(nouveau) {
  const cle = JSON.stringify(nouveau);
  if (cle === rendu) return;
  if (etat?.partie && !nouveau.partie) {
    revelee = false;
    onglet = 'partie';
    dernierSon = 0;
    file = [];
  }
  const partieEnCours = Boolean(etat?.partie);
  etat = nouveau;
  rendu = cle;
  const annonces = etat.partie?.annonces ?? [];
  if (son && etat.hote) {
    file.push(...annonces.filter(a => a.id > dernierSon && doitParler(a.fichier)).map(a => a.fichier));
    narrer();
  }
  const changement = partieEnCours && annonces.findLast(a =>
    a.id > dernierSon && ['maire-elu', 'nouveau-maire'].includes(a.fichier));
  if (changement) {
    nomination.querySelector('span').textContent = changement.message;
    nomination.hidden = false;
    clearTimeout(minuterieMaire);
    minuterieMaire = setTimeout(() => { nomination.hidden = true; }, 4500);
  }
  dernierSon = annonces.at(-1)?.id ?? 0;
  afficher();
}

async function narrer() {
  if (!son || lecture || !file.length) return;
  lecture = true;
  lecteur.src = `/audio/${file.shift()}.mp3`;
  try { await lecteur.play(); }
  catch {
    son = false;
    file = [];
    lecture = false;
    montrer('Le son est bloqué. Réactive la narration sur ce téléphone.');
    afficher();
  }
}
lecteur.addEventListener('ended', () => { lecture = false; narrer(); });
lecteur.addEventListener('error', () => { if (lecture) { lecture = false; narrer(); } });

async function rafraichir() {
  if (attente) return;
  const version = revision;
  try {
    if (token) {
      const nouveau = await api('etat', {});
      if (version === revision && !attente) actualiser(nouveau);
    }
    else if (reprise) {
      const resultat = await api('reprise', {}, reprise);
      if (resultat.statut === 'acceptee') {
        enregistrer({ code, token: resultat.token });
        reprise = null;
        montrer('');
        actualiser(await api('etat', {}));
      } else if (resultat.statut === 'refusee') {
        reprise = null;
        afficher();
        montrer('L’hôte a refusé la demande.');
      }
    }
  } catch (erreur) {
    if (version !== revision || attente) return;
    if (erreur.status === 401 || erreur.status === 404) {
      localStorage.removeItem(stockage(code));
      token = null;
      etat = null;
      rendu = '';
      afficher();
    }
    if (reprise && erreur.status === 400) { reprise = null; afficher(); }
    if (erreurExpiree !== erreur.message) montrer(erreur.message);
    erreurExpiree = erreur.message;
  }
}
function surveiller() {
  clearInterval(minuteur);
  minuteur = setInterval(rafraichir, 900);
  rafraichir();
}

const hero = (titre, sousTitre) => `<section class="hero"><div><h1>${titre}</h1><p>${sousTitre}</p></div></section>`;
const champPseudo = '<label>Pseudo<input name="nom" required maxlength="24" autocomplete="nickname"></label>';

function accueil() {
  const quantites = { villageois: 1, loups: 1, voyante: 1, sorciere: 1, chasseur: 1 };
  return hero('Loup-Garou', 'Un village, des secrets. Une carte sur chaque téléphone.') + `
    <div class="grille">
      ${!code ? `<section class="panneau"><h2>Créer une partie</h2><form data-form="creer">
        ${champPseudo}<label>Nombre de joueurs<input name="total" type="number" min="5" max="16" value="5" required></label>
        <fieldset><legend>Composition des rôles</legend>${Object.entries(roles).map(([id, [nom]]) => `
          <label class="ligne">${nom}<input name="${id}" aria-label="Nombre de ${nom}" type="number" min="0" max="${['loups', 'villageois'].includes(id) ? 16 : 1}" value="${quantites[id]}" required></label>`).join('')}
        </fieldset>
        <label>Ordre de nuit<select name="ordre"><option value="voyante,loups,sorciere">Voyante → Loups → Sorcière</option><option value="loups,voyante,sorciere">Loups → Voyante → Sorcière</option><option value="loups,sorciere,voyante">Loups → Sorcière → Voyante</option></select></label>
        <label class="case"><input name="maire" type="checkbox" checked>Élection du maire</label>
        <label class="case"><input name="discret" type="checkbox">Appels de nuit discrets</label>
        <button>Créer le salon</button>
      </form></section>` : ''}
      <section class="panneau"><h2>${code ? `Rejoindre le salon ${code}` : 'Rejoindre une partie'}</h2>
        <form data-form="rejoindre"><label>Code du salon<input name="code" required minlength="6" maxlength="6" pattern="[A-Za-z2-9]{6}" value="${code}" autocapitalize="characters"></label>
        ${champPseudo}<button>Rejoindre</button></form>
        ${code ? `<p></p><button class="discret" data-action="reprises" ${reprise ? 'disabled' : ''}>${reprise ? 'Demande envoyée à l’hôte' : 'Reprendre ma place'}</button><div id="reprise"></div><p><a href="/">Accueil</a></p>` : ''}
      </section>
    </div>`;
}

function invitation() {
  const url = new URL(`/?salon=${code}`, location.origin);
  return `<img class="qr" alt="QR code du salon ${code}" src="/api/salons/${code}/qr?url=${encodeURIComponent(url.href)}">
    <a class="invitation" href="${echapper(url.href)}">${echapper(url.href)}</a>`;
}
function demandes() {
  return etat.demandes.map(d => `<div class="annonce"><p>${echapper(d.nom)} veut reprendre sa place.</p><div class="actions">
    <button data-action="decision" data-id="${d.id}" data-accepte="oui">Accepter</button><button class="discret" data-action="decision" data-id="${d.id}">Refuser</button></div></div>`).join('');
}
function joueurs(partie) {
  return `<ul class="noms">${etat.joueurs.map(j => `<li><span class="${partie && !partie.vivants.includes(j.id) ? 'elimine' : ''}">${echapper(j.nom)}${j.id === etat.joueur ? ' (toi)' : ''}</span>${partie?.maire === j.id ? medaille : ''}</li>`).join('')}</ul>`;
}
function salon() {
  return hero('Salon', `Code <span class="code">${code}</span>`) + `<div class="grille">
    <section class="panneau"><h2>Joueurs · ${etat.joueurs.length}/${etat.total}</h2>${joueurs()}${demandes()}
      ${etat.hote ? `<div class="actions"><button data-action="son" class="discret">${son ? 'Couper la narration' : 'Activer la narration'}</button>
        <button data-action="lancer" ${etat.joueurs.length !== etat.total ? 'disabled' : ''}>Lancer la partie</button></div>` : '<p class="second">En attente du lancement par l’hôte.</p>'}
    </section><section class="panneau"><h2>Invitation</h2>${invitation()}</section></div>`;
}
function optionJoueur(id) {
  return `<option value="${id}">${etat.partie.maire === id ? '♛ ' : ''}${etiquette(id)}</option>`;
}
function commandes(p) {
  if (p.phase === 'fin') {
    const message = { village: 'Le village remporte la partie.', loups: 'Les Loups-Garous remportent la partie.', egalite: 'Aucun camp n’a survécu.' }[p.gagnant];
    return `<p>${message}</p>${etat.hote ? '<button data-action="retour">Retour au salon</button>' : ''}`;
  }
  if (!p.action) return '<p class="second">En attente des autres joueurs.</p>';
  if (p.phase === 'distribution') return '<button data-action="agir">Je suis prêt</button>';
  if (p.phase === 'debat') return '<button data-action="agir">Terminer le débat</button>';
  if (p.phase === 'egaliteElection') return '<div class="actions"><button data-action="agir" data-choix="revoter">Refaire le vote</button><button class="discret" data-action="agir" data-choix="tirer">Tirer au sort</button></div>';
  if (p.phase === 'sorciere') return `<form data-form="sorciere">
    ${p.action.soin ? `<label class="case"><input type="checkbox" name="soin">Sauver ${echapper(p.action.victime)}</label>` : '<p class="second">Aucun soin disponible cette nuit.</p>'}
    ${p.action.poison ? `<label>Poison<select name="poison"><option value="">Garder la potion</option>${p.action.cibles.map(optionJoueur).join('')}</select></label>` : ''}
    <button>Valider mes potions</button></form>`;
  return `<form data-form="cible"><label>Joueur<select name="cible" required><option value="">Choisir un joueur</option>${p.action.cibles.map(optionJoueur).join('')}</select></label><button>Valider</button></form>`;
}
function carte(p) {
  const [nom, camp, pouvoir] = roles[p.role];
  return `<section class="panneau carte-zone"><h2>Ta carte</h2>
    <button class="carte ${revelee ? 'revelee' : ''}" data-action="carte" aria-label="${revelee ? 'Cacher ma carte' : 'Retourner ma carte'}">
      <span class="face dos"></span><span class="face recto ${p.role}"></span>
    </button>
    ${revelee ? `<h3>${nom}</h3><p><strong>Camp ${camp}</strong></p><p>${pouvoir}</p>
    ${p.allies.length ? `<p>Ta meute · ${p.allies.map(echapper).join(', ')}</p>` : ''}` : '<p class="second">Touche la carte pour révéler ton rôle.</p>'}</section>`;
}
function historique(p) {
  return `<section class="panneau"><h2>Historique privé</h2>${p.historique.length
    ? `<ul>${p.historique.map(a => `<li>Nuit ${a.nuit} · ${echapper(a.nom)} — ${roles[a.role][0]}</li>`).join('')}</ul>`
    : '<p class="second">Aucune révélation pour le moment.</p>'}</section>`;
}
function partie() {
  const p = etat.partie;
  const annonce = p.annonces.findLast(a => a.message);
  const contenu = onglet === 'carte' ? carte(p) : onglet === 'historique' ? historique(p) : `<section class="panneau">
    <h2>${phases[p.phase]}</h2>${annonce ? `<p class="annonce">${['maire-elu', 'nouveau-maire'].includes(annonce.fichier) ? medaille + ' ' : ''}${echapper(annonce.message)}</p>` : ''}
    ${p.phase === 'distribution' ? `<p><button class="discret" data-action="onglet" data-onglet="carte">Voir ma carte</button></p>` : ''}
    ${commandes(p)}</section>`;
  return hero('Loup-Garou', p.jour ? `Tour ${p.jour} · Salon ${code}` : `Salon ${code}`) + `<div class="grille">
    ${contenu}<section class="panneau"><h2>Le village</h2>${joueurs(p)}
    ${etat.hote ? `<button data-action="son" class="discret">${son ? 'Couper la narration' : 'Activer la narration'}</button>${demandes()}
    <details><summary>Afficher le QR code de reprise</summary>${invitation()}</details>` : ''}</section></div>
    <nav class="flottante" aria-label="Navigation de la partie">${[['partie', 'Partie'], ['carte', 'Ma carte'], ['historique', 'Historique']].map(([id, nom]) =>
      `<button data-action="onglet" data-onglet="${id}" class="${onglet === id ? '' : 'discret'}" aria-current="${onglet === id ? 'page' : 'false'}">${nom}</button>`).join('')}</nav>`;
}

function afficher() {
  const qrOuvert = app.querySelector('details')?.open;
  const focus = document.activeElement;
  const formulaire = focus?.closest?.('[data-form]');
  const conserve = formulaire && ['sorciere', 'cible'].includes(formulaire.dataset.form) && formulaire.dataset.numero === String(etat?.partie?.numero);
  const valeurs = conserve ? [...formulaire.elements].filter(e => e.name).map(e => [e.name, e.value, e.checked]) : [];
  app.innerHTML = etat ? etat.partie ? partie() : salon() : accueil();
  if (qrOuvert && app.querySelector('details')) app.querySelector('details').open = true;
  const actif = app.querySelector('[data-form="cible"],[data-form="sorciere"]');
  if (actif) {
    actif.dataset.numero = etat.partie.numero;
    for (const [nom, valeur, coche] of valeurs) {
      const champ = actif.elements.namedItem(nom);
      if (champ) { champ.value = valeur; champ.checked = coche; }
    }
    if (conserve && focus?.name) actif.elements.namedItem(focus.name)?.focus();
  }
}

async function agir(choix, numero = etat.partie.numero) {
  actualiser(await api('agir', { numero, choix }));
}
async function executer(operation) {
  if (attente) return;
  attente = true;
  revision++;
  montrer('');
  try { await operation(); }
  catch (erreur) { montrer(erreur.message); }
  finally { attente = false; }
}

app.addEventListener('submit', evenement => {
  evenement.preventDefault();
  const form = evenement.target;
  const data = new FormData(form);
  executer(async () => {
    switch (form.dataset.form) {
      case 'creer': {
        const composition = Object.fromEntries(Object.keys(roles).map(id => [id, Number(data.get(id))]));
        const ordre = data.get('ordre').split(',').filter(id => composition[id] > 0);
        enregistrer(await api('', { nom: data.get('nom'), total: Number(data.get('total')), composition, ordre, maire: data.has('maire'), discret: data.has('discret') }));
        break;
      }
      case 'rejoindre':
        code = data.get('code').toUpperCase();
        try { enregistrer(await api('rejoindre', { nom: data.get('nom') })); }
        catch (erreur) { afficher(); throw erreur; }
        break;
      case 'recuperer': {
        const r = await api('recuperer', { joueur: data.get('joueur') });
        reprise = r.secret;
        afficher();
        surveiller();
        return;
      }
      case 'cible': return agir(data.get('cible'), Number(form.dataset.numero));
      case 'sorciere': return agir({ soin: data.has('soin'), poison: data.get('poison') || null }, Number(form.dataset.numero));
      default: return;
    }
    actualiser(await api('etat', {}));
    surveiller();
  });
});

app.addEventListener('click', evenement => {
  const bouton = evenement.target.closest('[data-action]');
  if (!bouton) return;
  const { action, id, accepte, choix } = bouton.dataset;
  if (action === 'onglet') {
    onglet = bouton.dataset.onglet;
    afficher();
    return;
  }
  if (action === 'carte') {
    revelee = !revelee;
    afficher();
    const carteApres = app.querySelector('.carte');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      carteApres.animate?.([{ opacity: .4 }, { opacity: 1 }], { duration: 180 });
    } else {
      carteApres.animate?.([{ transform: revelee ? 'rotateY(0)' : 'rotateY(180deg)' }, { transform: revelee ? 'rotateY(180deg)' : 'rotateY(0)' }],
        { duration: 640, easing: 'ease-in-out' });
    }
    carteApres.focus();
    return;
  }
  if (action === 'son') {
    son = !son;
    file = [];
    if (son && !lecture) {
      file.push(etat.partie?.annonces.findLast(a => doitParler(a.fichier))?.fichier ?? 'le-village-sendort');
      narrer();
    } else if (!son) { lecteur.pause(); lecture = false; }
    afficher();
    return;
  }
  executer(async () => {
    if (action === 'reprises') {
      const { joueurs } = await api('joueurs');
      const zone = document.querySelector('#reprise');
      zone.innerHTML = `<form data-form="recuperer"><label>Ton ancien pseudo<select name="joueur" required><option value="">Choisis ton pseudo</option>${joueurs.map(j => `<option value="${j.id}">${echapper(j.nom)}</option>`).join('')}</select></label><button>Demander la reprise</button></form>`;
    } else if (action === 'agir') await agir(choix ?? null);
    else if (action === 'decision') actualiser(await api(action, { id, accepte: accepte === 'oui' }));
    else actualiser(await api(action, {}));
  });
});

afficher();
if (token) surveiller();
