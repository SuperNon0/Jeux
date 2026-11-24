import { randomInt, randomUUID } from 'node:crypto';
import { annonceElimination, candidatsEnTete, causesDeMort, ordreDeNuit, phraseAvecPrenom, roles, tirerAuSort, votePasse } from './regles.mjs';
import { rolesHistoriques } from './public/loup-garou/roles/index.mjs';

export const delaiForcage = 45_000;
export const delaiRevelation = 20_000;
// Certains rôles morts ou sans pouvoir sont quand même appelés.
export const dureeAppelFactice = [8, 14];

// Rôles ajoutés par fichier : leur pouvoir passe par les crochets décrits dans public/loup-garou/roles/.
const rolesACrochets = Object.keys(roles).filter(role => !rolesHistoriques.includes(role));
const crochets = (nom) => rolesACrochets.map(role => [role, roles[role][nom]]).filter(([, f]) => typeof f === 'function');

const phasesDeChoix = new Set([
  ...Object.keys(roles).filter(role => roles[role].nuit), 'chasseur', 'departage', 'succession',
]);

export function verifierConfiguration(total, composition, ordre) {
  if (!Number.isInteger(total) || total < 5 || total > 16) throw new Error('Choisis entre 5 et 16 joueurs.');
  const quantites = Object.fromEntries(Object.keys(roles).map(role => [role, composition?.[role] ?? 0]));
  if (Object.values(quantites).some(n => !Number.isInteger(n) || n < 0) ||
      Object.entries(quantites).some(([role, nombre]) => nombre > 1 && !roles[role].multiple) ||
      Object.values(quantites).reduce((somme, n) => somme + n, 0) !== total ||
      quantites.loups < 1 || quantites.loups * 2 >= total) {
    throw new Error('Répartis toutes les places. Prévois au moins un loup, des villageois majoritaires et un exemplaire au plus de chaque rôle spécial.');
  }
  if (ordre !== undefined && !Array.isArray(ordre)) throw new Error('Ordre de nuit invalide.');
  return { composition: quantites, ordre: ordreDeNuit(quantites, ordre) };
}

export class Partie {
  constructor(joueurs, config, numero = 0) {
    this.joueurs = joueurs;
    this.config = config;
    this.cartes = new Map();
    this.vivants = new Set(joueurs.map(({ id }) => id));
    this.historiques = new Map(joueurs.map(({ id }) => [id, []]));
    this.annonces = [];
    this.id = randomUUID();
    this.numero = numero;
    this.jour = 0;
    this.debutPartie = Date.now();
    this.tempsSuspendu = 0;
    this.maire = null;
    this.pause = null;
    this.potions = { soin: true, poison: true };
    const cartes = Object.entries(config.composition).flatMap(([role, total]) => Array(total).fill(role));
    for (const { id } of joueurs) {
      const position = randomInt(cartes.length);
      this.cartes.set(id, cartes[position]);
      cartes.splice(position, 1);
    }
    this.phase('distribution', [...this.vivants], [], 'distribution');
  }

  sauvegarde() {
    const { joueurs, config, cartes, vivants, historiques, tour, ...etat } = this;
    return { ...etat, cartes: [...cartes], vivants: [...vivants], historiques: [...historiques],
      tour: { ...tour, reponses: [...tour.reponses] } };
  }

  static charger(etat, joueurs, config) {
    return Object.assign(Object.create(Partie.prototype), etat, {
      joueurs, config, cartes: new Map(etat.cartes), vivants: new Set(etat.vivants),
      historiques: new Map(etat.historiques),
      finAnnoncePhase: etat.finAnnoncePhase ?? etat.annonces.length,
      debutPartie: etat.debutPartie ?? etat.tour.debut,
      tempsSuspendu: etat.tempsSuspendu ?? 0,
      tour: { ...etat.tour, reponses: new Map(etat.tour.reponses) },
    });
  }

  animateurs() {
    return [this.config.hote, this.config.cohote].filter(Boolean);
  }

  changerCohote(id) {
    this.config.cohote = id;
    if (['debat', 'attenteNuit', 'egaliteVote', 'egaliteElection'].includes(this.tour.type)) this.tour.acteurs = this.animateurs();
  }

  geler(type, maintenant = Date.now()) {
    if ((this.tour.type === 'fin' && !this.tour.preparation) || this.pause === type ||
        (this.pause === 'manuelle' && type === 'absence')) return false;
    if (!this.pause) this.pauseDepuis = maintenant;
    this.pause = type;
    return true;
  }

  reprendre(maintenant = Date.now()) {
    if (!this.pause) return false;
    const retard = Math.max(0, maintenant - this.pauseDepuis);
    this.tour.debut += retard;
    this.tempsSuspendu += retard;
    if (this.tour.echeance) this.tour.echeance += retard;
    if (this.tour.preparation) this.tour.preparation.limite += retard;
    this.pause = null;
    this.pauseDepuis = null;
    return true;
  }

  prolonger() {
    const tour = this.tour;
    if (this.pause || tour.type !== 'debat' || !tour.echeance) throw new Error('Ce débat n’a pas de compte à rebours actif.');
    tour.echeance = Math.min(tour.echeance + 30_000, Date.now() + 900_000);
  }

  demarrerChrono(annonce = null, maintenant = Date.now()) {
    const { preparation, duree } = this.tour;
    if (this.pause || !preparation || (annonce !== null && annonce !== preparation.annonce)) return false;
    this.tour.echeance = duree ? maintenant + duree * 1000 : null;
    delete this.tour.preparation;
    this.annonceLue = null;
    return true;
  }

  suivreAnnonce(id) {
    if (Number.isInteger(id) && id >= this.tour.annonceDepuis + 1 &&
        id >= (this.annonceLue ?? 0) && this.annonces[id - 1]) this.annonceLue = id;
  }

  actualiserTemps(maintenant) {
    if (this.pause) return false;
    if (this.tour.preparation) {
      return !this.config.narrationObligatoire &&
        maintenant >= this.tour.preparation.limite && this.demarrerChrono(null, maintenant);
    }
    if (!this.tour.echeance || maintenant < this.tour.echeance) return false;
    if (this.tour.factice) this.terminerRoleNocturne(this.tour.type);
    else if (this.tour.type === 'debat') this.ouvrirVote();
    else if (this.tour.type === 'compteARebours') this.nuit();
    else if (this.tour.type === 'sorciere' && this.potionAttendue() === 'soin' && this.potions.poison) {
      this.ouvrirPoison(maintenant);
    }
    else if (this.tour.type === 'loups') this.cloreLoups();
    else if (phasesDeChoix.has(this.tour.type)) {
      const { acteurs, reponses } = this.tour;
      this.passer(acteurs.filter(id => !reponses.has(id)));
    }
    else this.terminerTour();
    return true;
  }

  absents(estEnLigne, maintenant = Date.now()) {
    const tour = this.tour;
    if (this.pause || tour.preparation || maintenant < tour.debut + 15_000) return [];
    const force = maintenant >= tour.debut + delaiForcage;
    const enAttente = tour.type === 'loups' && force && tour.reponses.size === tour.acteurs.length
      ? [...tour.acteurs] : tour.acteurs.filter(id => !tour.reponses.has(id));
    return enAttente.filter(id => force || !estEnLigne(id));
  }

  passer(absents) {
    if (!absents.length) throw new Error('Aucune action absente à passer pour le moment.');
    const { type, acteurs, reponses } = this.tour;
    if (['cupidon', 'voyante', 'sorciere', 'salvateur', 'corbeau', ...rolesACrochets].includes(type) && roles[type]?.nuit) {
      this.terminerRoleNocturne(type);
    }
    else if (type === 'chasseur') this.resoudreEffets();
    // Le maire mourant n’a pas désigné de successeur à temps : le sort choisit parmi les vivants.
    else if (type === 'succession') {
      if (this.vivants.size) {
        this.annoncer('tirage-au-sort');
        this.elire(tirerAuSort([...this.vivants]), true);
      }
      this.resoudreEffets();
    }
    else if (type === 'departage') this.eliminerAuVote(tirerAuSort(this.tour.cibles));
    else if (type === 'loups') {
      for (const id of absents) if (!reponses.has(id)) reponses.set(id, null);
      if (reponses.size === acteurs.length) this.terminerTour();
    }
    else if (['distribution', 'election', 'vote'].includes(type)) {
      for (const id of absents) reponses.set(id, null);
      if (reponses.size === acteurs.length) this.terminerTour();
    } else throw new Error('Cette étape attend un animateur.');
  }

  cloreLoups() {
    for (const id of this.tour.acteurs) if (!this.tour.reponses.has(id)) this.tour.reponses.set(id, null);
    this.terminerTour();
  }

  meuteUnanime() {
    const choix = [...this.tour.reponses.values()];
    return choix.length === this.tour.acteurs.length && choix[0] != null && choix.every(cible => cible === choix[0]);
  }

  annoncer(fichier, message) {
    this.annonces.push({ id: this.annonces.length + 1, fichier, message });
  }

  // Phrase dite avec le prénom du joueur quand sa piste existe (« maire-elu-noe »).
  annoncerNom(base, id) {
    const { fichier, message } = phraseAvecPrenom(base, this.nom(id));
    this.annoncer(fichier, message);
  }

  // Chronique secrète de la partie, réservée au panneau d’administration.
  noter(texte) {
    this.chronique ??= [];
    this.chronique.push({ moment: `${this.moment === 'nuit' ? 'Nuit' : 'Jour'} ${this.jour}`, texte });
  }

  nomEtRole(id) { return id ? `${this.nom(id)} (${this.nomRole(this.cartes.get(id))})` : 'personne'; }

  // Le joueur qui porte ce rôle cette nuit, pour la chronique.
  porteur(role) { return this.nom(this.tour.acteurs[0]) ?? this.nomRole(role); }

  phase(type, acteurs, cibles, fichier) {
    const debut = Date.now();
    const duree = type === 'compteARebours' ? 10 : type === 'debat' ? this.config.debatSecondes
      : ['election', 'vote'].includes(type) ? this.config.voteSecondes
      : phasesDeChoix.has(type) ? this.config.roleSecondes : 0;
    const annonceDepuis = this.finAnnoncePhase ?? 0;
    if (fichier) this.annoncer(fichier);
    const differe = type !== 'distribution' && this.config.narration && this.annonces.length > annonceDepuis;
    this.annonceLue = null;
    this.tour = { type, acteurs, cibles, numero: ++this.numero, reponses: new Map(), debut, duree,
      echeance: duree && !differe ? debut + duree * 1000 : null,
      annonceDepuis };
    if (differe) this.tour.preparation = { annonce: this.annonces.length, limite: debut + 90_000 };
    this.finAnnoncePhase = this.annonces.length;
  }

  nom(id) { return this.joueurs.find(joueur => joueur.id === id)?.nom; }

  nomRole(role) { return roles[role]?.nom ?? role; }

  partenaireAmoureux(id) {
    if (this.couple?.includes(id)) return this.couple.find(partenaire => partenaire !== id);
  }

  nuit() {
    if (this.jour === 0) {
      this.debutPartie = Date.now();
      this.tempsSuspendu = 0;
    }
    this.jour++;
    this.revelationVote = null;
    this.indexNuit = 0;
    this.victimeLoups = null;
    this.poison = null;
    this.ancienMorduCetteNuit = false;
    this.derniereProtection = this.protection ?? null;
    this.protection = null;
    this.cibleCorbeau = null;
    this.marqueCorbeau = null;
    this.victimesNuit = [];
    this.moment = 'nuit';
    this.annoncer('le-village-sendort');
    this.prochainRole();
  }

  prochainRole() {
    while (this.indexNuit < this.config.ordre.length) {
      const role = this.config.ordre[this.indexNuit++];
      const regle = roles[role];
      if (regle.nuit.premiereNuitSeulement && this.jour !== 1) continue;
      const acteurs = [...this.vivants].filter(id => this.cartes.get(id) === role);
      // Un Gardien mort n’est plus appelé une fois sa carte révélée à tous ; sinon l’appel factice garde le secret.
      if (role === 'salvateur' && !acteurs.length && this.rolesRevelesMorts(role)) continue;
      const cibles = this.ciblesDeNuit(role, acteurs);
      const actif = acteurs.length && cibles.length &&
        !(role === 'sorciere' && !this.potions.poison && (!this.potions.soin || !this.victimeLoups)) &&
        (regle.actif?.(this, acteurs) ?? true);
      if (actif) {
        this.phase(role, acteurs, cibles, this.config.discret ? undefined : role);
        return;
      }
      // Les loups ne peuvent pas disparaître sans finir la partie : seuls les autres rôles sont simulés.
      if (!this.config.discret && role !== 'loups') {
        this.phase(role, [], [], role);
        const [min, max] = dureeAppelFactice;
        this.tour.factice = true;
        this.tour.duree = min + randomInt(max - min + 1);
        if (!this.tour.preparation) this.tour.echeance = this.tour.debut + this.tour.duree * 1000;
        return;
      }
    }
    for (const [, auReveil] of crochets('auReveil')) auReveil(this);
    this.annoncer('le-village-se-reveille');
    const causes = new Map();
    for (const [id, cause] of [[this.victimeLoups, 'loups'], [this.poison, 'poison'], ...(this.victimesNuit ?? [])]) {
      if (id && !causes.has(id)) causes.set(id, cause);
    }
    const victimes = [...causes.keys()];
    this.annoncer(victimes.length ? 'nuit-avec-victimes' : 'nuit-sans-victime',
      victimes.length ? `Élimination de nuit · ${victimes.map(id => this.nom(id)).join(', ')}` : 'Miracle : cette nuit, personne n’est mort.');
    // Les morts de l’aube restent notées « Nuit » dans la chronique ; la suite se passe le jour.
    this.eliminer([...causes], 'debat');
    this.moment = 'jour';
  }

  ciblesDeNuit(role, acteurs) {
    if (roles[role].cibles) return roles[role].cibles(this, acteurs);
    return [...this.vivants].filter(id => {
      if (role === 'salvateur') return id !== this.derniereProtection;
      if (['voyante', 'sorciere', 'cupidon'].includes(role)) return true;
      return !acteurs.includes(id);
    });
  }

  // Un rôle ajouté par fichier peut faire mourir quelqu’un en plus pendant la nuit (dans auReveil).
  ajouterVictimeNuit(id, cause) {
    this.victimesNuit ??= [];
    if (this.vivants.has(id) && !this.victimesNuit.some(([victime]) => victime === id)) this.victimesNuit.push([id, cause]);
  }

  // Vrai si toutes les cartes de ce rôle sont mortes et montrées au village (annonce du rôle ou vote).
  rolesRevelesMorts(role) {
    const porteurs = [...this.cartes].filter(([, carte]) => carte === role).map(([id]) => id);
    return porteurs.length > 0 && porteurs.every(id => !this.vivants.has(id) && this.mortsRevelees?.includes(id));
  }

  // Mémoire d’un rôle ajouté par fichier, sauvegardée avec la partie.
  etatRole(role) {
    this.etatsRoles ??= {};
    return (this.etatsRoles[role] ??= {});
  }

  terminerRoleNocturne(role) {
    if (!this.tour.factice && this.tour.type === role && this.tour.acteurs.length && !this.tour.note) {
      this.noter(`${this.nomRole(role)} (${this.porteur(role)}) n’a rien choisi à temps.`);
    }
    if (!this.config.discret) {
      this.annoncer(`fin-${role}`);
      if (role === 'cupidon' && this.couple) this.annoncer('amoureux-lies');
    }
    this.prochainRole();
  }

  potionAttendue() { return this.tour.etapePotion ?? (this.potions.soin && this.victimeLoups ? 'soin' : 'poison'); }

  ouvrirPoison(maintenant = Date.now()) {
    this.tour.etapePotion = 'poison';
    this.tour.numero = ++this.numero;
    this.tour.debut = maintenant;
    this.tour.echeance = this.tour.duree ? maintenant + this.tour.duree * 1000 : null;
  }

  debat() { this.phase('debat', this.animateurs(), [], 'debut-debat'); }

  attendreNuit() { this.phase('attenteNuit', this.animateurs(), []); }

  ouvrirVote() { this.voteElimination(); }

  // Au réveil, le village élit d’abord son maire s’il n’en a pas, puis débat.
  journee() {
    if (this.config.maire && !this.maire) this.vote('election');
    else this.debat();
  }

  vote(type, cibles = [...this.vivants], fichier = type === 'election' ? 'election-maire' : 'vote-elimination') {
    this.phase(type, [...this.vivants], cibles, fichier);
    this.tour.relance = fichier === 'second-tour';
  }

  voteElimination() {
    this.annoncer('fin-debat');
    this.vote('vote');
  }

  // Passage du vote : désactivé, à la majorité, à l’unanimité ou sur décision du maire (majorité sans maire),
  // au premier vote de la partie seulement ou à chaque vote d’élimination.
  modePassage() {
    const mode = this.config.passageVote ?? 'majorite';
    return mode === 'maire' && !this.vivants.has(this.maire) ? 'majorite' : mode;
  }

  peutPasserVote(id) {
    const portee = this.config.passagePortee ?? 'premier';
    const mode = this.modePassage();
    return this.tour.type === 'vote' && !this.tour.relance && mode !== 'non' &&
      (portee === 'tous' || this.jour === 1) && (id === undefined || mode !== 'maire' || id === this.maire);
  }

  votePasse(reponses) {
    const mode = this.modePassage();
    if (!this.peutPasserVote()) return false;
    const pour = this.tour.acteurs.filter(acteur => reponses.get(acteur) === votePasse).length;
    if (mode === 'maire') return reponses.get(this.maire) === votePasse;
    if (mode === 'unanimite') return pour === this.tour.acteurs.length;
    return pour > this.tour.acteurs.length / 2;
  }

  elire(id, succession = false) {
    this.maire = id;
    this.annoncerNom(succession ? 'nouveau-maire' : 'maire-elu', id);
    this.noter(`${this.nomEtRole(id)} devient maire${succession ? ' par succession' : ''}.`);
  }

  eliminer(victimes, suite) {
    this.effets = [];
    this.suite = suite;
    // Compatibilité avec les sauvegardes d’avant le tir immédiat du Chasseur.
    if (suite === 'debat' && this.chasseurAuReveil) {
      this.effets.push({ type: 'chasseur', acteur: this.chasseurAuReveil });
      this.chasseurAuReveil = null;
    }
    const victimesDirectes = victimes.map(([id]) => id);
    for (const [id, cause] of victimes) this.enlever(id, cause, victimesDirectes);
    this.resoudreEffets();
  }

  enlever(id, cause, victimesDirectes = []) {
    if (!this.vivants.delete(id)) return;
    const role = this.cartes.get(id);
    if (this.config.annoncesEliminations || cause === 'vote') (this.mortsRevelees ??= []).push(id);
    // Vote, chagrin et tir ont déjà dit le prénom : seule la piste du rôle suit.
    const dejaNomme = ['vote', 'amour', 'chasseur'].includes(cause);
    if (this.config.annoncesEliminations) {
      for (const { fichier, message } of annonceElimination(this.nom(id), role, !dejaNomme)) this.annoncer(fichier, message);
    }
    (this.morts ??= []).push({ moment: `${this.moment === 'nuit' ? 'Nuit' : 'Jour'} ${this.jour}`, id, nom: this.nom(id),
      cause, annonce: this.annonces.length });
    this.noter(`${this.nomEtRole(id)} meurt : ${causesDeMort[cause] ?? cause}.`);
    for (const [, surMort] of crochets('surMort')) surMort(this, id, cause);
    // Le Chasseur tire quelle que soit la cause de sa mort : loups, vote, poison ou chagrin.
    if (role === 'chasseur') {
      this.effets.unshift({ type: 'chasseur', acteur: id });
    }
    if (this.maire === id) {
      this.maire = null;
      this.effets.push({ type: 'succession', acteur: id });
    }
    const partenaire = this.partenaireAmoureux(id);
    if (this.vivants.has(partenaire) && !victimesDirectes.includes(partenaire)) {
      this.annoncerNom('mort-amoureux', partenaire);
      this.enlever(partenaire, 'amour');
    }
  }

  resoudreEffets() {
    const plusDeLoup = ![...this.vivants].some(id => this.cartes.get(id) === 'loups');
    if (this.effets.length && !plusDeLoup) {
      const { type, acteur } = this.effets.shift();
      const { fichier } = phraseAvecPrenom(type === 'succession' ? 'succession-maire' : 'chasseur', this.nom(acteur));
      this.phase(type, [acteur], [...this.vivants], fichier);
      this.annonces.at(-1).message = phraseAvecPrenom(type === 'succession' ? 'succession-maire' : 'chasseur', this.nom(acteur)).message;
      return;
    }
    this.effets = [];
    for (const [, victoire] of crochets('victoire')) {
      const gagnant = victoire(this);
      if (gagnant) {
        this.gagnant = gagnant;
        this.noter(`Fin de la partie : victoire ${this.nomRole(gagnant)}.`);
        this.phase('fin', [], [], `victoire-${gagnant}`);
        return;
      }
    }
    const loups = [...this.vivants].filter(id => this.cartes.get(id) === 'loups').length;
    const [premier, second] = this.couple ?? [];
    const coupleMixte = this.vivants.has(premier) && this.vivants.has(second) &&
      roles[this.cartes.get(premier)].camp !== roles[this.cartes.get(second)].camp;
    const victoireAmoureux = coupleMixte && this.vivants.size === 2;
    if (victoireAmoureux || loups === 0 || (!coupleMixte && loups * 2 >= this.vivants.size)) {
      this.gagnant = victoireAmoureux ? 'amoureux' : !this.vivants.size ? 'egalite' : loups ? 'loups' : 'village';
      this.noter(`Fin de la partie : ${{ amoureux: 'les amoureux gagnent', egalite: 'aucun survivant', loups: 'les Loups-Garous gagnent', village: 'le village gagne' }[this.gagnant]}.`);
      this.phase('fin', [], [], this.gagnant === 'egalite' ? 'match-nul' : `victoire-${this.gagnant}`);
      return;
    }
    if (this.suite === 'debat') {
      if (this.vivants.has(this.cibleCorbeau)) {
        this.marqueCorbeau = this.cibleCorbeau;
        this.annoncerNom('marque-corbeau', this.marqueCorbeau);
      }
      this.journee();
    } else this.attendreNuit();
  }

  eliminerAuVote(id) {
    this.revelationVote = { numero: this.numero, nom: this.nom(id), role: this.cartes.get(id) };
    this.annoncerNom('resultat-vote', id);
    this.eliminer([[id, 'vote']], 'nuit');
  }

  agir(id, numero, choix) {
    const { type, acteurs, cibles, reponses } = this.tour;
    if (this.pause) throw new Error('La partie est en pause.');
    if (this.tour.preparation) throw new Error('Attends la fin de l’annonce.');
    if (numero !== this.numero || !acteurs.includes(id) || (reponses.has(id) && type !== 'loups')) {
      throw new Error('Cette action n’est plus disponible.');
    }
    if (type === 'debat') { this.ouvrirVote(); return; }
    if (type === 'lancement') {
      if (this.config.narrationObligatoire) {
        if (!this.config.narration) throw new Error('Active le son pour lancer la partie.');
        this.phase('compteARebours', [], [], 'compte-a-rebours');
      } else this.nuit();
      return;
    }
    if (type === 'attenteNuit') { this.nuit(); return; }
    if (type === 'egaliteElection' || type === 'egaliteVote') {
      if (!['revoter', 'tirer'].includes(choix)) throw new Error('Choisis comment départager les candidats.');
      const election = type === 'egaliteElection';
      if (choix === 'revoter') this.vote(election ? 'election' : 'vote', cibles, 'second-tour');
      else {
        this.annoncer('tirage-au-sort');
        const gagnant = tirerAuSort(cibles);
        if (election) { this.elire(gagnant); this.debat(); }
        else this.eliminerAuVote(gagnant);
      }
      return;
    }
    if (type === 'cupidon') {
      if (!Array.isArray(choix) || choix.length !== 2 || choix[0] === choix[1] ||
          !choix.every(cible => cibles.includes(cible))) {
        throw new Error('Choisis deux joueurs différents et encore en vie.');
      }
      this.couple = [...choix];
      this.tour.note = true;
      this.noter(`Cupidon (${this.nom(id)}) lie ${this.nomEtRole(choix[0])} et ${this.nomEtRole(choix[1])}.`);
      this.terminerRoleNocturne(type);
      return;
    }
    if (type === 'voyante' && this.tour.revelationAttendue) {
      if (choix !== 'confirmer') throw new Error('Confirme que tu as vu la carte.');
      this.tour.note = true;
      this.terminerRoleNocturne(type);
      return;
    }
    if (type === 'sorciere') {
      if (choix?.potion) {
        if (choix.potion !== this.potionAttendue()) throw new Error('Cette potion n’est plus disponible à cette étape.');
        if (choix.potion === 'soin') {
          if (typeof choix.utiliser !== 'boolean') throw new Error('Confirme ton choix de potion de soin.');
          this.noter(choix.utiliser ? `La Sorcière (${this.nom(id)}) sauve ${this.nomEtRole(this.victimeLoups)}.`
            : `La Sorcière (${this.nom(id)}) garde sa potion de soin.`);
          if (choix.utiliser) { this.potions.soin = false; this.victimeLoups = null; }
          this.tour.note = true;
          if (this.potions.poison) { this.ouvrirPoison(); return; }
        } else {
          if (!this.potions.poison || (choix.cible !== null && !cibles.includes(choix.cible))) {
            throw new Error('Choix de potion de poison invalide.');
          }
          if (choix.cible) { this.potions.poison = false; this.poison = choix.cible; }
          this.noter(choix.cible ? `La Sorcière (${this.nom(id)}) empoisonne ${this.nomEtRole(choix.cible)}.`
            : `La Sorcière (${this.nom(id)}) garde sa potion de poison.`);
        }
        this.tour.note = true;
        this.terminerRoleNocturne(type);
        return;
      }
      if (typeof choix?.soin !== 'boolean' ||
          (choix.soin && (!this.potions.soin || !this.victimeLoups)) ||
          (choix.poison !== null && (!this.potions.poison || !cibles.includes(choix.poison)))) {
        throw new Error('Choix de potion invalide.');
      }
      if (choix.soin) this.noter(`La Sorcière (${this.nom(id)}) sauve ${this.nomEtRole(this.victimeLoups)}.`);
      if (choix.poison) this.noter(`La Sorcière (${this.nom(id)}) empoisonne ${this.nomEtRole(choix.poison)}.`);
      if (!choix.soin && !choix.poison) this.noter(`La Sorcière (${this.nom(id)}) garde ses potions.`);
      if (choix.soin) { this.potions.soin = false; this.victimeLoups = null; }
      if (choix.poison) { this.potions.poison = false; this.poison = choix.poison; }
      this.tour.note = true;
      this.terminerRoleNocturne(type);
      return;
    }
    const protectionPassee = Boolean(roles[type]?.nuit?.passer) && choix === null;
    const passageDuVote = choix === votePasse && this.peutPasserVote(id);
    if (cibles.length && !protectionPassee && !passageDuVote && (!cibles.includes(choix) || (type === 'voyante' && choix === id))) {
      throw new Error('Choisis un joueur disponible.');
    }
    reponses.set(id, choix);
    // Le maire qui décide de passer le vote clôt le scrutin sans attendre les autres.
    const decisionMaire = passageDuVote && this.modePassage() === 'maire';
    if (decisionMaire || (type === 'loups' ? this.meuteUnanime() : reponses.size === acteurs.length)) this.terminerTour();
  }

  noterBulletins(titre, reponses) {
    const lignes = this.tour.acteurs.map(votant => {
      const choix = reponses.get(votant);
      return `${this.nom(votant)} → ${choix === votePasse ? 'passer' : this.nom(choix) ?? 'abstention'}`;
    });
    this.noter(`${titre} : ${lignes.join(', ')}.`);
  }

  terminerTour() {
    const { type, reponses } = this.tour;
    const [id, choix] = reponses.entries().next().value ?? [];
    switch (type) {
      case 'distribution': this.phase('lancement', [this.config.hote], []); break;
      case 'voyante':
        this.noter(`La Voyante (${this.nom(id)}) découvre ${this.nomEtRole(choix)}.`);
        this.tour.note = true;
        this.historiques.get(id).push({ nuit: this.jour, nom: this.nom(choix), role: this.cartes.get(choix) });
        this.tour.reponses.clear();
        this.tour.revelationAttendue = true;
        this.tour.debut = Date.now();
        this.tour.echeance = this.tour.debut + delaiRevelation;
        this.tour.numero = ++this.numero;
        break;
      case 'salvateur':
        this.noter(choix ? `Le Gardien (${this.nom(id)}) protège ${this.nom(choix)}.` : `Le Gardien (${this.nom(id)}) ne protège personne.`);
        this.tour.note = true;
        this.protection = choix;
        this.terminerRoleNocturne(type);
        break;
      case 'loups': {
        const premiers = candidatsEnTete(reponses);
        const cible = premiers.length ? tirerAuSort(premiers) : null;
        const bulletins = [...reponses].map(([loup, vise]) => `${this.nom(loup)} → ${this.nom(vise) ?? 'aucun choix'}`).join(', ');
        let issue = '';
        this.victimeLoups = cible === this.protection ? null : cible;
        if (cible && !this.victimeLoups) issue = ' Le Gardien la protège.';
        if (this.victimeLoups && crochets('surAttaque').some(([, surAttaque]) => surAttaque(this, this.victimeLoups))) {
          this.victimeLoups = null;
          issue = ' Sa maison est vide.';
        }
        if (this.cartes.get(this.victimeLoups) === 'ancien' && !this.ancienTouche) {
          this.ancienTouche = true;
          this.ancienMorduCetteNuit = true;
          this.victimeLoups = null;
          issue = ' L’Ancien résiste à la morsure.';
        }
        this.noter(`Loups : ${bulletins}. Cible : ${cible ? this.nomEtRole(cible) : 'personne'}${premiers.length > 1 ? ' (tirage au sort)' : ''}.${issue}`);
        this.tour.note = true;
        this.terminerRoleNocturne(type);
        break;
      }
      case 'corbeau':
        this.noter(choix ? `Le Corbeau (${this.nom(id)}) marque ${this.nom(choix)}.` : `Le Corbeau (${this.nom(id)}) ne marque personne.`);
        this.tour.note = true;
        this.cibleCorbeau = choix;
        this.terminerRoleNocturne(type);
        break;
      case 'election': {
        this.noterBulletins('Élection du maire', reponses);
        const premiers = candidatsEnTete(reponses);
        if (premiers.length > 1) this.phase('egaliteElection', this.animateurs(), premiers, 'egalite-election');
        else {
          if (premiers.length) this.elire(premiers[0]);
          else this.annoncer('aucun-vote-maire', 'Aucun vote à l’élection du maire.');
          this.debat();
        }
        break;
      }
      case 'vote': {
        const marque = !this.tour.relance && this.vivants.has(this.marqueCorbeau) ? this.marqueCorbeau : null;
        this.noterBulletins(this.tour.relance ? 'Second tour' : 'Vote d’élimination', reponses);
        if (this.votePasse(reponses)) {
          this.marqueCorbeau = null;
          this.annoncer('vote-passe', 'Le village a choisi de passer le vote. Personne n’est éliminé.');
          this.attendreNuit();
          break;
        }
        const bulletins = new Map([...reponses].map(([id, cible]) => [id, cible === votePasse ? null : cible]));
        const bonus = {};
        for (const [, surVote] of crochets('surVote')) {
          for (const [cible, voix] of Object.entries(surVote(this, bulletins) ?? {})) bonus[cible] = (bonus[cible] ?? 0) + voix;
        }
        const premiers = candidatsEnTete(bulletins, this.maire, marque, bonus);
        this.marqueCorbeau = null;
        if (!premiers.length) {
          this.annoncer('aucun-vote-elimination', 'Aucun vote reçu. Personne n’est éliminé.');
          this.attendreNuit();
        } else if (premiers.length === 1) this.eliminerAuVote(premiers[0]);
        else {
          if (this.maire) {
            const { fichier, message } = phraseAvecPrenom('departage-maire', this.nom(this.maire));
            this.phase('departage', [this.maire], premiers, fichier);
            this.annonces.at(-1).message = message;
            break;
          }
          this.annoncer('egalite-elimination');
          if (this.tour.relance) {
            this.phase('egaliteVote', this.animateurs(), premiers, 'egalite-vote-hote');
          } else this.vote('vote', premiers, 'second-tour');
        }
        break;
      }
      case 'departage':
        this.noter(`Le maire ${this.nom(id)} tranche contre ${this.nom(choix)}.`);
        this.eliminerAuVote(choix);
        break;
      case 'chasseur':
        this.noter(`Le Chasseur (${this.nom(id)}) tire sur ${this.nomEtRole(choix)}.`);
        this.annoncerNom('tir-chasseur', choix);
        this.enlever(choix, 'chasseur');
        this.resoudreEffets();
        break;
      case 'succession': this.elire(choix, true); this.resoudreEffets(); break;
      default:
        if (rolesACrochets.includes(type) && roles[type].nuit) {
          roles[type].agir?.(this, id, choix);
          this.noter(`${this.nomRole(type)} (${this.nom(id)}) ${choix ? `choisit ${this.nomEtRole(choix)}` : 'passe son tour'}.`);
          this.tour.note = true;
          this.terminerRoleNocturne(type);
        }
    }
  }

  // Tout ce qui se passe dans la partie, pour le panneau d’administration : cartes, pouvoirs restants, votes en cours.
  suivi() {
    const { type, acteurs, reponses } = this.tour;
    const nom = id => this.nom(id) ?? '—';
    const ivrogne = this.etatsRoles?.ivrogne;
    const enfant = this.etatsRoles?.['enfant-sauvage'];
    const etats = [
      this.config.composition.sorciere && `Sorcière : soin ${this.potions.soin ? 'disponible' : 'utilisé'}, poison ${this.potions.poison ? 'disponible' : 'utilisé'}.`,
      this.couple && `Couple : ${nom(this.couple[0])} et ${nom(this.couple[1])}.`,
      this.config.composition.salvateur && `Gardien : protège ${nom(this.protection)} cette nuit, ${nom(this.derniereProtection)} la nuit précédente.`,
      this.config.composition.ancien && `Ancien : ${this.ancienTouche ? 'déjà mordu une fois' : 'pas encore mordu'}.`,
      this.config.composition.corbeau && (this.cibleCorbeau || this.marqueCorbeau) && `Corbeau : marque sur ${nom(this.marqueCorbeau ?? this.cibleCorbeau)}.`,
      enfant?.modele && `Enfant sauvage : modèle ${nom(enfant.modele)}${enfant.transforme ? ', devenu Loup-Garou' : ''}.`,
      ivrogne?.ivrogne && `Ivrogne : ${ivrogne.hote ? `dort chez ${nom(ivrogne.hote)}` : 'chez lui'} cette nuit.`,
      this.maire && `Maire : ${nom(this.maire)}.`,
    ].filter(Boolean);
    return {
      jour: this.jour, moment: this.moment ?? 'nuit', phase: type, gagnant: this.gagnant ?? null,
      causesVisibles: this.config.causesVisibles === true,
      joueurs: this.joueurs.map(({ id, nom }) => ({ nom, role: this.nomRole(this.cartes.get(id)), vivant: this.vivants.has(id) })),
      etats,
      enCours: acteurs.length && !this.tour.factice ? acteurs.map(acteur => ({
        nom: nom(acteur), choix: !reponses.has(acteur) ? null : reponses.get(acteur) === votePasse ? 'passer'
          : reponses.get(acteur) == null ? 'aucun choix' : typeof reponses.get(acteur) === 'string' ? nom(reponses.get(acteur)) : 'choisi',
      })) : [],
      chronique: this.chronique ?? [],
    };
  }

  vue(id) {
    const { type, numero, acteurs, cibles, reponses } = this.tour;
    const role = this.cartes.get(id);
    const concerne = acteurs.includes(id) && (!reponses.has(id) || type === 'loups');
    const peutAgir = concerne && !this.pause && !this.tour.preparation;
    const nuit = this.config.ordre.includes(type);
    const choix = phasesDeChoix.has(type);
    const { preparation, echeance, duree, debut } = this.tour;
    const hote = id === this.config.hote;
    const annonceLue = preparation && this.config.narration ? this.annonces[this.annonceLue - 1] : undefined;
    const annoncesDiffusables = Math.max(this.tour.annonceDepuis, this.annonceLue ?? 0);
    const annonces = preparation && this.config.annoncesEliminations
      ? this.annonces.map(annonce => {
        if (annonce.id > annoncesDiffusables && /^(?:elimination|deces|role)-/.test(annonce.fichier ?? '')) {
          return hote ? { id: annonce.id, fichier: annonce.fichier } : { id: annonce.id };
        }
        return annonce;
      })
      : this.annonces;
    const resultatElection = type === 'debat' ? annonces.findLast(a => a.id > this.tour.annonceDepuis &&
      /^(?:maire-elu|aucun-vote-maire)/.test(a.fichier ?? ''))?.message : undefined;
    let temps;
    if (!choix || concerne || hote) {
      if (preparation) temps = { attente: true, duree, phase: numero, annonce: hote ? preparation.annonce : undefined };
      else if (echeance) temps = { echeance, pauseDepuis: this.pauseDepuis };
      if (temps && choix && concerne && duree && !preparation) temps.choix = true;
    }
    return {
      id: this.id, jour: this.jour, maire: this.maire, marqueCorbeau: this.marqueCorbeau ?? null, vivants: [...this.vivants],
      phase: nuit && (!concerne || preparation) ? 'nuit' : type, pause: this.pause,
      temps, attendAnnonce: Boolean(preparation), resultatElection,
      narrationActive: this.config.narration === true,
      narrationObligatoire: this.config.narrationObligatoire === true,
      annonceLue: annonceLue?.fichier,
      messageEliminationLue: /^(?:elimination|role)-/.test(annonceLue?.fichier ?? '') ? annonceLue.message : undefined,
      revelationVote: preparation ? undefined : this.revelationVote,
      // Morts déjà annoncées ; la cause n’apparaît que si l’hôte l’a permis.
      morts: (this.morts ?? []).filter(mort => !preparation || mort.annonce <= annoncesDiffusables)
        .map(({ moment, nom, cause }) => ({ moment, nom, ...(this.config.causesVisibles && { cause: causesDeMort[cause] ?? cause }) })),
      causesVisibles: this.config.causesVisibles === true,
      // Les joueurs morts suivent toute la partie, comme le meneur.
      suivi: this.jour && !this.vivants.has(id) ? this.suivi() : undefined,
      chronoPartie: { debut: this.debutPartie, suspendu: this.tempsSuspendu,
        arrete: type === 'fin' ? debut : this.pauseDepuis },
      peutProlonger: type === 'debat' && peutAgir && Boolean(this.tour.echeance),
      numero: peutAgir ? numero : undefined, gagnant: this.gagnant, annonces, annonceDepuis: hote ? this.tour.annonceDepuis : undefined,
      progression: ['distribution', 'election', 'vote'].includes(type)
        ? { reponses: reponses.size, total: acteurs.length } : undefined,
      aRepondu: !nuit && reponses.has(id),
      bilan: type === 'fin' && !preparation ? Object.fromEntries(this.cartes) : undefined,
      infoRole: roles[role]?.info?.(this, id),
      revelationPrivee: preparation ? undefined : roles[role]?.revelationPrivee?.(this, id),
      role, amoureux: this.nom(this.partenaireAmoureux(id)),
      // Chaque amoureux connaît la carte de l’autre.
      roleAmoureux: this.cartes.get(this.partenaireAmoureux(id)), historique: this.historiques.get(id),
      allies: role === 'loups'
        ? this.joueurs.filter(joueur => joueur.id !== id && this.cartes.get(joueur.id) === 'loups').map(joueur => joueur.nom) : [],
      action: peutAgir ? {
        cibles: type === 'voyante' ? cibles.filter(cible => cible !== id) : cibles,
        ...(this.peutPasserVote(id) && { peutPasserVote: this.modePassage() }),
        ...(this.tour.revelationAttendue && { revelationAttendue: true }),
        ...(roles[type]?.vue && { info: roles[type].vue(this, id) }),
        ...(type === 'loups' && {
          choixActuel: reponses.get(id) ?? null,
          meute: acteurs.map(loup => ({ nom: this.nom(loup), cible: this.nom(reponses.get(loup)) ?? null, toi: loup === id })),
        }),
        ...(type === 'sorciere' && {
          potion: this.potionAttendue(),
          soin: this.potions.soin && Boolean(this.victimeLoups),
          poison: this.potions.poison,
          victime: this.nom(this.victimeLoups),
        }),
      } : null,
    };
  }
}
