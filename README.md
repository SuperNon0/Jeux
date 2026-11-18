# Jeux · Loup-Garou

Crée un salon, invite tes amis par QR code et joue depuis un téléphone par personne. La partie est synchronisée par le serveur. Elle fonctionne avec 5 à 16 joueurs sur le même réseau.

## Proxmox VE avec les menus Community Scripts

Depuis le shell de l’hôte Proxmox, en tant que `root` :

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/Jeux/main/ct/jeux.sh)"
```

Le script utilise le moteur de [Proxmox VE Helper-Scripts](https://community-scripts.org/) pour créer le conteneur LXC. Choisis les paramètres par défaut ou règle le stockage, le réseau et les ressources dans le menu avancé. Le conteneur télécharge ensuite le jeu et ses fichiers depuis ce dépôt. L’adresse sur le port `3000` s’affiche à la fin.

## Cloudflare Tunnel avec un lien hôte et un lien invité

Dans Cloudflare Zero Trust, réutilise ton tunnel existant. Remplace les domaines d’exemple ci-dessous par tes sous-domaines.

1. Dans **Access → Applications**, crée une application **Self-hosted** pour `hote.example.com`. Ajoute une règle **Allow** limitée à ton adresse e-mail ou aux comptes qui pourront héberger des parties. Récupère l’**Application Audience (AUD) Tag** et l’URL d’équipe `https://nom-equipe.cloudflareaccess.com`.
2. Dans ton tunnel, ajoute deux routes publiques. `hote.example.com` et `jouer.example.com` pointent vers le même service HTTP, par exemple `http://192.168.1.42:3000` si le connecteur tourne sur un autre conteneur. Si `cloudflared` tourne dans le conteneur du jeu, utilise `http://127.0.0.1:3000`. Conserve le nom d’hôte public sur chaque route. Si tu renseignes **HTTP Host Header**, utilise le sous-domaine public correspondant à cette route.
3. Sur la route hôte, active **Protect with Access** avec la même équipe et le même AUD. Le jeu valide aussi le jeton Access côté serveur. Laisse la route `jouer.example.com` hors de l’application Access de l’hôte pour permettre aux invités de rejoindre avec leur QR ou leur code.

Dans le conteneur LXC du jeu, renseigne ces quatre valeurs dans `/etc/jeux-cloudflare.env` :

```ini
JEUX_URL_HOTE=https://hote.example.com
JEUX_URL_INVITES=https://jouer.example.com
CF_ACCESS_TEAM_DOMAIN=https://nom-equipe.cloudflareaccess.com
CF_ACCESS_AUD=REMPLACER_PAR_LE_TAG_AUD
```

Lance `systemctl edit jeux.service` et ajoute le bloc suivant :

```ini
[Service]
EnvironmentFile=/etc/jeux-cloudflare.env
```

Recharge le service avec `systemctl daemon-reload && systemctl restart jeux`. Pour une première vérification, ouvre le lien hôte en navigation privée et connecte-toi. Crée un salon, puis ouvre son lien invité dans une autre fenêtre privée. L’invité doit pouvoir rejoindre, tandis que la création du salon et l’utilisation de la session de l’hôte sont réservées au lien protégé. Le jeu exige une connexion sortante vers le domaine d’équipe pour récupérer les clés de signature de Cloudflare Access.

[Documentation Cloudflare Access et Tunnel](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)

### Panneau d’administration

Une fois connecté au lien hôte, ouvre **Administration** pour voir tous les salons du serveur, y compris les salons en pause. Le panneau affiche leur état et le nombre de joueurs, sans afficher leurs cartes ni leurs votes.

- **Annonces audio** permet d’écouter un fichier, de remplacer une annonce existante ou d’ajouter un MP3 à la bibliothèque. Taille maximale de 8 Mio. Dans **Son d’un événement**, tu peux aussi associer un MP3 à une étape du jeu, le préécouter et régler le volume des annonces. Les MP3 importés restent dans `/var/lib/jeux/audio` quand une mise à jour remplace le code.
- **Mise à jour** récupère la branche `main` de `SuperNon0/Jeux`. Le panneau affiche le téléchargement, la préparation des dépendances, le redémarrage et la vérification du service. S’il ne redémarre pas correctement, le service restaure le dossier précédent. Les parties et les sessions sauvegardées reprennent après reconnexion. Les journaux sont accessibles avec `journalctl -u jeux-update.service -n 50`.

Le déroulement par étapes est inspiré de [Nextcloud Updater](https://github.com/nextcloud/updater/blob/master/index.php). La vérification après redémarrage et le retour à la version précédente suivent le principe de [Home Assistant Supervisor](https://github.com/home-assistant/supervisor/blob/main/supervisor/homeassistant/core.py). L’autorisation avant traitement d’un fichier audio et son passage par un dossier temporaire reprennent un principe d’[Audiobookshelf](https://github.com/advplyr/audiobookshelf/blob/master/server/utils/fileUploadMiddleware.js).

Pour équiper un conteneur déjà installé avec l’ancienne version, relance une fois la commande suivante **dans le conteneur LXC Debian**, après publication de cette version sur GitHub :

```sh
script=$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/Jeux/main/install/jeux-install.sh) && bash -c "$script"
```

Cette commande installe aussi le service de mise à jour, son déclencheur et FFmpeg pour valider les fichiers audio importés. Le port détecté dans le service existant est conservé. Pour forcer un autre port, remplace la fin par `bash -c "$script" bash 8080` en adaptant le port.

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

Ouvre `http://ADRESSE-IP-DE-LA-VM:3000` depuis un téléphone sur le même réseau. Le QR code reprend cette adresse, donc ouvre le jeu par l’adresse de la VM avant de partager le code. Pour choisir un autre port, lance par exemple `PORT=8080 npm start`. Après mise à jour du dépôt, relance `npm ci`, puis redémarre le serveur. Pour activer la sauvegarde lors d’une installation manuelle, lance par exemple `JEUX_ETAT=./var npm start` depuis le dossier du projet. Sur Proxmox, l’installateur active la sauvegarde.

## Lancer une partie

- **Essayer la démo** ouvre une partie privée depuis un seul téléphone avec quatre joueurs simulés.
- L’hôte choisit une composition prête à jouer ou règle les rôles à la main. Les compositions favorites sont gardées sur le navigateur.
- L’hôte et le co-hôte peuvent mettre le jeu en pause et passer les actions des personnes hors ligne après 15 secondes. Lorsque le vote est chronométré, les bulletins manquants deviennent des abstentions. Un débat chronométré peut être prolongé de 30 secondes.
- Quand le salon est plein, l’hôte peut activer la narration sur son téléphone puis lancer la partie.
- Chaque joueur retourne sa carte et confirme qu’il est prêt. Le serveur avance quand toutes les actions attendues sont terminées. L’hôte clôt le débat pour ouvrir le vote.
- Après actualisation, le même navigateur retrouve automatiquement sa session. Si elle est perdue, ouvre à nouveau le QR et demande à reprendre ton ancien pseudo. L’hôte doit valider la demande.

En cas d’égalité au vote des loups, le serveur tire au sort entre les cibles arrivées en tête. Sans maire, un vote d’élimination à égalité est relancé entre les candidats arrivés en tête. Si l’égalité persiste, l’hôte peut relancer le vote ou tirer au sort. Les loups gagnent lorsqu’ils sont au moins aussi nombreux que les autres survivants. Le village gagne une fois le dernier loup éliminé.

## Retrouver un salon

« Mes salons » conserve les invitations et tes places sur ce navigateur. Si tout le monde ferme le jeu, le salon passe en pause après environ 15 secondes, avec ses rôles, ses votes et l’étape en cours. « Quitter l’écran » marque immédiatement ta place hors ligne. Rouvre le salon pour reprendre. Sur Proxmox, l’état est sauvegardé dans `/var/lib/jeux/donnees`. Tu peux rouvrir ta session après un redémarrage ou une mise à jour. Le serveur retire les salons après 24 heures sans activité.

L’interface utilise le [kit Encre](https://github.com/SuperNon0/Biblioth-que-de-filme/tree/claude/project-thread-vegilo) avec ses icônes et ses polices locales.

## Remplacer les annonces

Les 24 annonces fournies sont dans [public/audio](public/audio). Pour modifier une annonce, remplace le fichier par un autre MP3 du même nom. Par exemple, remplace `le-village-sendort.mp3` pour l’annonce de début de nuit ou `election-maire.mp3` pour l’ouverture de l’élection. Le serveur lit les fichiers sur disque et les navigateurs vérifient leur fraîcheur. Aucun service de synthèse n’est requis pendant les parties.

Le mode discret joue les transitions communes et masque les appels individuels de nuit. Les consignes des rôles concernés restent disponibles sur leurs écrans privés.

## Vérifier

Le test d’import audio utilise `ffmpeg`.

```sh
npm test
```
