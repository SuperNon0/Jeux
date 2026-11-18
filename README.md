# Jeux · Loup-Garou

Crée un salon, invite tes amis par QR code et joue depuis un téléphone par personne. La partie est synchronisée par le serveur. Elle fonctionne avec 5 à 16 joueurs sur le même réseau.

## Proxmox VE avec les menus Community Scripts

Depuis le shell de l’hôte Proxmox, en tant que `root` :

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/Jeux/main/ct/jeux.sh)"
```

Le script utilise le moteur de [Proxmox VE Helper-Scripts](https://community-scripts.org/) pour créer le conteneur LXC. Choisis les paramètres par défaut ou règle le stockage, le réseau et les ressources dans le menu avancé. Le conteneur télécharge ensuite le jeu et ses fichiers depuis ce dépôt. L’adresse sur le port `3000` s’affiche à la fin.

## Installation autonome sur Proxmox VE

Proxmox utilise des conteneurs **LXC**. Le script crée un conteneur Debian 13 non privilégié et installe le jeu comme service `systemd`. Il choisit un identifiant disponible, réserve 2 cœurs, 1 Gio de RAM et 8 Gio de disque. Par défaut, il utilise le pont `vmbr0`, une adresse DHCP et le port `3000`. L’hôte et le conteneur ont besoin d’un accès Internet pour télécharger le modèle Debian, Node.js et les dépendances npm.

Pour préparer un installateur autonome depuis le dossier du projet :

```sh
bash installer-proxmox.sh --emballer /tmp/installer-jeux-proxmox.run
```

Après avoir copié le fichier sur l’hôte Proxmox, ouvre le shell de l’hôte en tant que `root` et lance :

```sh
bash /root/installer-jeux-proxmox.run
```

Le script affiche l’adresse du jeu à la fin. Depuis un téléphone connecté au même réseau, ouvre cette adresse pour créer un salon. Si tu utilises une configuration différente, indique les réglages avant la commande, par exemple `BRIDGE=vmbr1 STORAGE=local-lvm JEUX_PORT=8080 bash /root/installer-jeux-proxmox.run`. Les réglages facultatifs sont `CTID`, `CT_HOSTNAME`, `BRIDGE`, `STORAGE`, `TEMPLATE_STORAGE`, `JEUX_PORT` et `IP_CONFIG` (par exemple `192.168.1.50/24,gw=192.168.1.1`).

Dans le conteneur, les MP3 se trouvent dans `/opt/jeux/public/audio`. Tu peux remplacer un fichier depuis le shell Proxmox avec `pct push ID /chemin/annonce.mp3 /opt/jeux/public/audio/nom-existant.mp3 --perms 0644`. Pour les journaux, lance `pct exec ID -- journalctl -u jeux -n 50` en remplaçant `ID` par le numéro du conteneur.

## Installation manuelle sur Linux

Avec Node.js 22 ou supérieur, depuis le dossier du projet :

```sh
npm ci
npm start
```

Ouvre `http://ADRESSE-IP-DE-LA-VM:3000` depuis un téléphone sur le même réseau. Le QR code reprend cette adresse, donc ouvre le jeu par l’adresse de la VM avant de partager le code. Pour choisir un autre port, lance par exemple `PORT=8080 npm start`. Après mise à jour du dépôt, relance `npm ci`, puis redémarre le serveur. Arrête le serveur entre deux parties, car les salons et les sessions sont conservés dans sa mémoire.

## Lancer une partie

- L’hôte choisit le nombre de joueurs, la composition, l’ordre des appels nocturnes et l’option du maire.
- Quand le salon est plein, l’hôte peut activer la narration sur son téléphone puis lancer la partie.
- Chaque joueur retourne sa carte et confirme qu’il est prêt. Le serveur avance quand toutes les actions attendues sont terminées. L’hôte clôt le débat pour ouvrir le vote.
- Après actualisation, le même navigateur retrouve automatiquement sa session. Si elle est perdue, ouvre à nouveau le QR et demande à reprendre ton ancien pseudo. L’hôte doit valider la demande.

En cas d’égalité au vote des loups, le serveur tire au sort entre les cibles arrivées en tête. Sans maire, un vote d’élimination à égalité est relancé entre les candidats arrivés en tête. Les loups gagnent lorsqu’ils sont au moins aussi nombreux que les autres survivants. Le village gagne une fois le dernier loup éliminé.

## Remplacer les annonces

La narration est produite par Piper avec le [modèle français Tom](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/tom/medium). Les 24 MP3 sont dans [public/audio](public/audio). Pour modifier une annonce, remplace le fichier par un autre MP3 du même nom. Par exemple, remplace `le-village-sendort.mp3` pour l’annonce de début de nuit ou `election-maire.mp3` pour l’ouverture de l’élection. Le serveur lit les fichiers sur disque et les navigateurs vérifient leur fraîcheur. Aucun service de synthèse n’est requis pendant les parties.

Le mode discret joue les transitions communes et masque les appels individuels de nuit. Les consignes des rôles concernés restent disponibles sur leurs écrans privés.

## Vérifier

```sh
npm test
```
