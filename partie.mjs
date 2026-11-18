import { randomInt } from 'node:crypto';
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
  constructor(joueurs, config) {
    this.joueurs = joueurs;
    this.config = config;
    this.cartes = new Map();
    this.vivants = new Set(joueurs.map(({ id }) => id));
    this.historiques = new Map(joueurs.map(({ id }) => [id, []]));
    this.annonces = [];
    this.numero = 0;
    this.jour = 0;
    this.maire = null;
    this.potions = { soin: true, poison: true };
    const cartes = Object.entries(config.composition).flatMap(([role, total]) => Array(total).fill(role));
    for (const { id } of joueurs) {
      const position = randomInt(cartes.length);
      this.cartes.set(id, cartes[position]);
      cartes.splice(position, 1);
    }
    this.phase('distribution', [...this.vivants], [], 'distribution');
  }

  annoncer(fichier, message) {
    this.annonces.push({ id: this.annonces.length + 1, fichier, message });
  }

  phase(type, acteurs, cibles, fichier) {
    this.tour = { type, acteurs, cibles, numero: ++this.numero, reponses: new Map() };
    if (fichier) this.annoncer(fichier);
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
    this.eliminer(victimes.map(id => [id, id === this.victimeLoups ? 'loups' : 'poison']), () => this.debat());
  }

  debat() { this.phase('debat', [this.config.hote], [], 'debut-debat'); }

  vote(type, cibles = [...this.vivants], fichier = type === 'election' ? 'election-maire' : 'vote-elimination') {
    this.phase(type, [...this.vivants], cibles, fichier);
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
      this.phase('fin', [], [], this.gagnant === 'egalite' ? undefined : `victoire-${this.gagnant}`);
      return;
    }
    this.suite();
  }

  eliminerAuVote(id) {
    this.annoncer('resultat-vote', `${this.nom(id)} a été éliminé par le village.`);
    this.eliminer([[id, 'vote']], () => this.nuit());
  }

  agir(id, numero, choix) {
    const { type, acteurs, cibles, reponses } = this.tour;
    if (numero !== this.numero || !acteurs.includes(id) || reponses.has(id)) {
      throw new Error('Cette action n’est plus disponible.');
    }
    if (type === 'egaliteElection') {
      if (!['revoter', 'tirer'].includes(choix)) throw new Error('Choisis comment départager les candidats.');
      if (choix === 'revoter') this.vote('election', cibles, 'second-tour');
      else {
        this.annoncer('tirage-au-sort');
        this.elire(tirerAuSort(cibles));
        this.voteElimination();
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
      this.prochainRole();
      return;
    }
    if (cibles.length && (!cibles.includes(choix) || (type === 'voyante' && choix === id))) {
      throw new Error('Choisis un joueur disponible.');
    }
    reponses.set(id, choix);
    if (reponses.size < acteurs.length) return;
    switch (type) {
      case 'distribution': this.nuit(); break;
      case 'voyante':
        this.historiques.get(id).push({ nuit: this.jour, nom: this.nom(choix), role: this.cartes.get(choix) });
        this.prochainRole();
        break;
      case 'loups':
        this.victimeLoups = tirerAuSort(candidatsEnTete(reponses));
        this.prochainRole();
        break;
      case 'debat':
        this.annoncer('fin-debat');
        if (this.config.maire && !this.maire) this.vote('election');
        else this.voteElimination();
        break;
      case 'election': {
        const premiers = candidatsEnTete(reponses);
        if (premiers.length > 1) this.phase('egaliteElection', [this.config.hote], premiers, 'egalite-election');
        else { this.elire(premiers[0]); this.voteElimination(); }
        break;
      }
      case 'vote': {
        const premiers = candidatsEnTete(reponses, this.maire);
        if (premiers.length === 1) this.eliminerAuVote(premiers[0]);
        else {
          this.annoncer('egalite-elimination');
          if (this.maire) this.phase('departage', [this.maire], premiers, 'departage-maire');
          else this.vote('vote', premiers, 'second-tour');
        }
        break;
      }
      case 'departage': this.eliminerAuVote(choix); break;
      case 'chasseur':
        this.annoncer(null, `Le Chasseur a emporté ${this.nom(choix)}.`);
        this.enlever(choix, 'chasseur');
        this.resoudreEffets();
        break;
      case 'succession': this.elire(choix, true); this.resoudreEffets(); break;
    }
  }

  vue(id) {
    const { type, numero, acteurs, cibles, reponses } = this.tour;
    const peutAgir = acteurs.includes(id) && !reponses.has(id);
    const nuit = this.config.ordre.includes(type);
    return {
      jour: this.jour, maire: this.maire, vivants: [...this.vivants],
      phase: nuit && !peutAgir ? 'nuit' : type,
      numero: peutAgir ? numero : undefined, gagnant: this.gagnant, annonces: this.annonces,
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
