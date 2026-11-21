import { randomInt, randomUUID } from 'node:crypto';
import { candidatsEnTete, ordreDeNuit, roles, tirerAuSort } from './regles.mjs';

export function verifierConfiguration(total, composition, ordre) {
  if (!Number.isInteger(total) || total < 5 || total > 16) throw new Error('Choisis entre 5 et 16 joueurs.');
  const quantites = Object.fromEntries(Object.keys(roles).map(role => [role, composition?.[role] ?? 0]));
  if (Object.values(quantites).some(n => !Number.isInteger(n) || n < 0) ||
      ['voyante', 'sorciere', 'chasseur'].some(role => quantites[role] > 1) ||
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
    if (['debat', 'egaliteVote', 'egaliteElection'].includes(this.tour.type)) this.tour.acteurs = this.animateurs();
  }

  geler(type, maintenant = Date.now()) {
    if (this.tour.type === 'fin' || this.pause === type || (this.pause === 'manuelle' && type === 'absence')) return false;
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
    this.tour.echeance = maintenant + duree * 1000;
    delete this.tour.preparation;
    return true;
  }

  actualiserTemps(maintenant) {
    if (this.pause) return false;
    if (this.tour.preparation) {
      return maintenant >= this.tour.preparation.limite && this.demarrerChrono(null, maintenant);
    }
    if (!this.tour.echeance || maintenant < this.tour.echeance) return false;
    if (this.tour.type === 'debat') this.ouvrirVote();
    else this.terminerTour();
    return true;
  }

  absents(estEnLigne, maintenant = Date.now()) {
    const tour = this.tour;
    return !this.pause && maintenant >= tour.debut + 15_000
      ? tour.acteurs.filter(id => !tour.reponses.has(id) && !estEnLigne(id)) : [];
  }

  passer(absents) {
    if (!absents.length) throw new Error('Aucune action absente à passer pour le moment.');
    const { type, acteurs, reponses } = this.tour;
    if (['voyante', 'sorciere'].includes(type)) this.terminerRoleNocturne(type);
    else if (type === 'chasseur' || type === 'succession') this.resoudreEffets();
    else if (type === 'departage') this.eliminerAuVote(tirerAuSort(this.tour.cibles));
    else if (['distribution', 'loups', 'election', 'vote'].includes(type)) {
      for (const id of absents) reponses.set(id, null);
      if (reponses.size === acteurs.length) this.terminerTour();
    } else throw new Error('Cette étape attend un animateur.');
  }

  annoncer(fichier, message) {
    this.annonces.push({ id: this.annonces.length + 1, fichier, message });
  }

  phase(type, acteurs, cibles, fichier) {
    const debut = Date.now();
    const duree = type === 'debat' ? this.config.debatSecondes
      : ['election', 'vote'].includes(type) ? this.config.voteSecondes : 0;
    const differe = Boolean(duree && fichier && this.config.narration);
    this.tour = { type, acteurs, cibles, numero: ++this.numero, reponses: new Map(), debut, duree,
      echeance: duree && !differe ? debut + duree * 1000 : null,
      annonceDepuis: this.finAnnoncePhase ?? 0 };
    if (fichier) this.annoncer(fichier);
    if (differe) this.tour.preparation = { annonce: this.annonces.length, limite: debut + 90_000 };
    this.finAnnoncePhase = this.annonces.length;
  }

  nom(id) { return this.joueurs.find(joueur => joueur.id === id)?.nom; }

  nuit() {
    this.jour++;
    this.indexNuit = 0;
    this.victimeLoups = null;
    this.poison = null;
    this.annoncer('le-village-sendort');
    this.prochainRole();
  }

  prochainRole() {
    while (this.indexNuit < this.config.ordre.length) {
      const role = this.config.ordre[this.indexNuit++];
      const acteurs = [...this.vivants].filter(id => this.cartes.get(id) === role);
      if (!acteurs.length || (role === 'sorciere' && !this.potions.poison && (!this.potions.soin || !this.victimeLoups))) continue;
      const cibles = [...this.vivants].filter(id => role !== 'loups' || !acteurs.includes(id));
      this.phase(role, acteurs, cibles, this.config.discret ? undefined : role);
      return;
    }
    this.annoncer('le-village-se-reveille');
    const victimes = [...new Set([this.victimeLoups, this.poison].filter(Boolean))];
    this.annoncer(victimes.length ? 'nuit-avec-victimes' : 'nuit-sans-victime',
      victimes.length ? `Élimination de nuit · ${victimes.map(id => this.nom(id)).join(', ')}` : 'La nuit n’a fait aucune victime.');
    this.eliminer(victimes.map(id => [id, id === this.victimeLoups ? 'loups' : 'poison']), 'debat');
  }

  terminerRoleNocturne(role) {
    if (!this.config.discret) this.annoncer(`fin-${role}`);
    this.prochainRole();
  }

  debat() { this.phase('debat', this.animateurs(), [], 'debut-debat'); }

  ouvrirVote() {
    this.annoncer('fin-debat');
    if (this.config.maire && !this.maire) this.vote('election');
    else this.voteElimination();
  }

  vote(type, cibles = [...this.vivants], fichier = type === 'election' ? 'election-maire' : 'vote-elimination') {
    this.phase(type, [...this.vivants], cibles, fichier);
    this.tour.relance = fichier === 'second-tour';
  }

  voteElimination() { this.vote('vote'); }

  elire(id, succession = false) {
    this.maire = id;
    this.annoncer(succession ? 'nouveau-maire' : 'maire-elu',
      succession ? `${this.nom(id)} devient maire.` : `${this.nom(id)} a été élu maire.`);
  }

  eliminer(victimes, suite) {
    this.effets = [];
    this.suite = suite;
    for (const [id, cause] of victimes) this.enlever(id, cause);
    this.resoudreEffets();
  }

  enlever(id, cause) {
    if (!this.vivants.delete(id)) return;
    if (this.cartes.get(id) === 'chasseur' && ['loups', 'vote'].includes(cause)) {
      this.effets.unshift({ type: 'chasseur', acteur: id });
    }
    if (this.maire === id) {
      this.maire = null;
      this.effets.push({ type: 'succession', acteur: id });
    }
  }

  resoudreEffets() {
    if (this.effets.length && this.vivants.size) {
      const { type, acteur } = this.effets.shift();
      this.phase(type, [acteur], [...this.vivants], type === 'succession' ? 'succession-maire' : 'chasseur');
      return;
    }
    const loups = [...this.vivants].filter(id => this.cartes.get(id) === 'loups').length;
    if (loups === 0 || loups * 2 >= this.vivants.size) {
      this.gagnant = !this.vivants.size ? 'egalite' : loups ? 'loups' : 'village';
      this.phase('fin', [], [], this.gagnant === 'egalite' ? 'match-nul' : `victoire-${this.gagnant}`);
      return;
    }
    if (this.suite === 'debat') this.debat();
    else this.nuit();
  }

  eliminerAuVote(id) {
    this.annoncer('resultat-vote', `${this.nom(id)} a été éliminé par le village.`);
    this.eliminer([[id, 'vote']], 'nuit');
  }

  agir(id, numero, choix) {
    const { type, acteurs, cibles, reponses } = this.tour;
    if (this.pause) throw new Error('La partie est en pause.');
    if (numero !== this.numero || !acteurs.includes(id) || reponses.has(id)) {
      throw new Error('Cette action n’est plus disponible.');
    }
    if (type === 'debat') { this.ouvrirVote(); return; }
    if (type === 'egaliteElection' || type === 'egaliteVote') {
      if (!['revoter', 'tirer'].includes(choix)) throw new Error('Choisis comment départager les candidats.');
      const election = type === 'egaliteElection';
      if (choix === 'revoter') this.vote(election ? 'election' : 'vote', cibles, 'second-tour');
      else {
        this.annoncer('tirage-au-sort');
        const gagnant = tirerAuSort(cibles);
        if (election) { this.elire(gagnant); this.voteElimination(); }
        else this.eliminerAuVote(gagnant);
      }
      return;
    }
    if (type === 'sorciere') {
      if (typeof choix?.soin !== 'boolean' ||
          (choix.soin && (!this.potions.soin || !this.victimeLoups)) ||
          (choix.poison !== null && (!this.potions.poison || !cibles.includes(choix.poison)))) {
        throw new Error('Choix de potion invalide.');
      }
      if (choix.soin) { this.potions.soin = false; this.victimeLoups = null; }
      if (choix.poison) { this.potions.poison = false; this.poison = choix.poison; }
      this.terminerRoleNocturne(type);
      return;
    }
    if (cibles.length && (!cibles.includes(choix) || (type === 'voyante' && choix === id))) {
      throw new Error('Choisis un joueur disponible.');
    }
    reponses.set(id, choix);
    if (reponses.size === acteurs.length) this.terminerTour();
  }

  terminerTour() {
    const { type, reponses } = this.tour;
    const [id, choix] = reponses.entries().next().value ?? [];
    switch (type) {
      case 'distribution': this.nuit(); break;
      case 'voyante':
        this.historiques.get(id).push({ nuit: this.jour, nom: this.nom(choix), role: this.cartes.get(choix) });
        this.terminerRoleNocturne(type);
        break;
      case 'loups': {
        const premiers = candidatsEnTete(reponses);
        this.victimeLoups = premiers.length ? tirerAuSort(premiers) : null;
        this.terminerRoleNocturne(type);
        break;
      }
      case 'election': {
        const premiers = candidatsEnTete(reponses);
        if (premiers.length > 1) this.phase('egaliteElection', this.animateurs(), premiers, 'egalite-election');
        else {
          if (premiers.length) this.elire(premiers[0]);
          else this.annoncer('aucun-vote-maire', 'Aucun vote à l’élection du maire.');
          this.voteElimination();
        }
        break;
      }
      case 'vote': {
        const premiers = candidatsEnTete(reponses, this.maire);
        if (!premiers.length) {
          this.annoncer('aucun-vote-elimination', 'Aucun vote reçu. Personne n’est éliminé.');
          this.nuit();
        } else if (premiers.length === 1) this.eliminerAuVote(premiers[0]);
        else {
          this.annoncer('egalite-elimination');
          if (this.maire) this.phase('departage', [this.maire], premiers, 'departage-maire');
          else if (this.tour.relance) {
            this.phase('egaliteVote', this.animateurs(), premiers, 'egalite-vote-hote');
          } else this.vote('vote', premiers, 'second-tour');
        }
        break;
      }
      case 'departage': this.eliminerAuVote(choix); break;
      case 'chasseur':
        this.annoncer('tir-chasseur', `Le Chasseur a emporté ${this.nom(choix)}.`);
        this.enlever(choix, 'chasseur');
        this.resoudreEffets();
        break;
      case 'succession': this.elire(choix, true); this.resoudreEffets(); break;
    }
  }

  vue(id) {
    const { type, numero, acteurs, cibles, reponses } = this.tour;
    const concerne = acteurs.includes(id) && !reponses.has(id);
    const peutAgir = concerne && !this.pause;
    const nuit = this.config.ordre.includes(type);
    const { preparation, echeance, duree, debut } = this.tour;
    let temps;
    if (preparation) temps = { attente: true, duree, phase: numero, annonce: id === this.config.hote ? preparation.annonce : undefined };
    else if (echeance) temps = { echeance, pauseDepuis: this.pauseDepuis };
    return {
      id: this.id, jour: this.jour, maire: this.maire, vivants: [...this.vivants],
      phase: nuit && !concerne ? 'nuit' : type, pause: this.pause,
      temps,
      chronoPartie: { debut: this.debutPartie, suspendu: this.tempsSuspendu,
        arrete: type === 'fin' ? debut : this.pauseDepuis },
      peutProlonger: type === 'debat' && peutAgir && Boolean(this.tour.echeance),
      numero: peutAgir ? numero : undefined, gagnant: this.gagnant, annonces: this.annonces, annonceDepuis: id === this.config.hote ? this.tour.annonceDepuis : undefined,
      progression: ['distribution', 'election', 'vote'].includes(type)
        ? { reponses: reponses.size, total: acteurs.length } : undefined,
      aRepondu: !nuit && reponses.has(id),
      bilan: type === 'fin' ? Object.fromEntries(this.cartes) : undefined,
      role: this.cartes.get(id), historique: this.historiques.get(id),
      allies: this.cartes.get(id) === 'loups'
        ? this.joueurs.filter(joueur => joueur.id !== id && this.cartes.get(joueur.id) === 'loups').map(joueur => joueur.nom) : [],
      action: peutAgir ? {
        cibles: type === 'voyante' ? cibles.filter(cible => cible !== id) : cibles,
        ...(type === 'sorciere' && {
          soin: this.potions.soin && Boolean(this.victimeLoups),
          poison: this.potions.poison,
          victime: this.nom(this.victimeLoups),
        }),
      } : null,
    };
  }
}
