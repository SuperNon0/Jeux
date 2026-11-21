# Jeux · Loup-Garou

Crée un salon, invite tes amis par QR code et joue depuis un téléphone par personne. La partie est synchronisée par le serveur. Elle fonctionne avec 5 à 16 joueurs sur le même réseau.

## Proxmox VE avec les menus Community Scripts

Depuis le shell de l’hôte Proxmox, en tant que `root` :

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/Jeux/main/ct/jeux.sh)"
```

Le script utilise le moteur de [Proxmox VE Helper-Scripts](https://community-scripts.org/) pour créer le conteneur LXC. Choisis les paramètres par défaut ou règle le stockage, le réseau et les ressources dans le menu avancé. Le conteneur télécharge ensuite le jeu et ses fichiers depuis ce dépôt. L’adresse sur le port `3000` s’affiche à la fin.

## Cloudflare Tunnel avec un lien hôte et un lien invité

Réutilise ton tunnel existant. Les exemples ci-dessous utilisent `hote-jeux.super-nono.cc` et `jouer.super-nono.cc`. Le [tutoriel SSO de SuperNon0/site](https://github.com/SuperNon0/site/blob/main/docs/tuto-cloudflare-sso.md) décrit une application Access couvrant `*.super-nono.cc`. Si elle existe toujours, le sous-domaine invité doit avoir sa propre règle.

1. Dans **Zero Trust → Access controls → Applications**, crée une application **Self-hosted** pour le seul hostname `hote-jeux.super-nono.cc`. Ajoute une politique **Allow** pour les e-mails autorisés à administrer Jeux. Dans **Edit → Additional settings**, copie l’**Application Audience (AUD) Tag** de cette application. Note aussi l’URL complète de ton équipe, de la forme `https://nom-equipe.cloudflareaccess.com`.
2. Si ta règle générique couvre les invités, crée une application **Self-hosted** pour le seul hostname `jouer.super-nono.cc`, avec une politique **Bypass → Include Everyone**. L’application exacte prend priorité sur le domaine générique. Réserve cette règle au seul hostname invité. RecipeLog utilise le même principe d’exception ciblée sur une route. [Exemple RecipeLog](https://github.com/SuperNon0/recipelogs/blob/main/docs/connexion-cloudflare/README.md) · [Règles Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
3. Dans **Networks → Connectors → Cloudflare Tunnels**, ouvre ton tunnel et ajoute les deux **Published application routes**. Les deux pointent vers `http://IP_DU_LXC:3000` lorsque `cloudflared` tourne sur une autre machine. Utilise `http://127.0.0.1:3000` si le connecteur tourne dans le LXC du jeu. Sur chaque route, garde le hostname public envoyé au serveur. Si tu renseignes **HTTP Host Header**, mets le sous-domaine public correspondant à la route.
4. Active **Protect with Access** sur la route hôte avec le nom d’équipe et l’AUD utilisés à l’étape 1. Laisse ce réglage désactivé sur la route invitée. Jeux vérifie aussi le jeton hôte côté serveur, selon le même principe que le panneau de `site`. [Contrôle du JWT dans SuperNon0/site](https://github.com/SuperNon0/site/blob/main/panel/auth.py)

Dans le conteneur LXC, renseigne ces quatre valeurs dans `/etc/jeux-cloudflare.env`.

```ini
JEUX_URL_HOTE=https://hote-jeux.super-nono.cc
JEUX_URL_INVITES=https://jouer.super-nono.cc
CF_ACCESS_TEAM_DOMAIN=https://nom-equipe.cloudflareaccess.com
CF_ACCESS_AUD=REMPLACER_PAR_LE_TAG_AUD
```

Lance `systemctl edit jeux.service` et ajoute ce bloc.

```ini
[Service]
EnvironmentFile=/etc/jeux-cloudflare.env
```

Applique avec `systemctl daemon-reload && systemctl restart jeux`. Le jeu contacte le domaine de l’équipe pour récupérer les clés de signature. Vérifie ensuite les deux liens dans des fenêtres privées séparées.

- **Lien hôte**. Cloudflare demande l’e-mail. Après connexion, le site affiche Administration et permet de créer un salon.
- **Lien invité**. Ouvre le QR code créé par l’hôte. Le formulaire de pseudo s’affiche sans demande d’e-mail.
- **Diagnostic**. Depuis le LXC, `curl -fsS http://127.0.0.1:3000/sante` indique la version et l’état du service. Avec Cloudflare activé, ouvre le site via l’un des deux sous-domaines. Un code 421 sur l’un de ces liens indique généralement que le nom d’hôte transmis à Jeux diffère de celui configuré.

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
- Le compteur de partie affiche le temps écoulé hors pauses. Sur une nouvelle partie, les durées par défaut sont de 2 minutes pour le débat et de 1 minute pour le vote. La démo utilise 1 minute et 45 secondes. Tu peux régler ces durées dans le formulaire du salon.
- Si la narration est active, le compte à rebours commence à la fin de l’annonce de la phase. L’animateur peut aussi lancer le chrono immédiatement. Si l’annonce ne se termine pas, le serveur lance le chrono au plus tard après 90 secondes. Le débat peut être prolongé de 30 secondes. À la fin du vote, les bulletins manquants deviennent des abstentions.
- L’hôte et le co-hôte peuvent mettre le jeu en pause et passer les actions des personnes hors ligne après 15 secondes.
- Quand le salon est plein, l’hôte peut activer la narration sur son téléphone puis lancer la partie.
- Chaque joueur retourne sa carte et confirme qu’il est prêt. Le serveur avance quand toutes les actions attendues sont terminées. L’hôte clôt le débat pour ouvrir le vote.
- Après actualisation, le même navigateur retrouve automatiquement sa session. Si elle est perdue, ouvre à nouveau le QR et demande à reprendre ton ancien pseudo. L’hôte doit valider la demande.

En cas d’égalité au vote des loups, le serveur tire au sort entre les cibles arrivées en tête. Sans maire, un vote d’élimination à égalité est relancé entre les candidats arrivés en tête. Si l’égalité persiste, l’hôte peut relancer le vote ou tirer au sort. Les loups gagnent lorsqu’ils sont au moins aussi nombreux que les autres survivants. Le village gagne une fois le dernier loup éliminé.

## Retrouver un salon

« Mes salons » conserve les invitations et tes places sur ce navigateur. Si tout le monde ferme le jeu, le salon passe en pause après environ 15 secondes, avec ses rôles, ses votes et l’étape en cours. « Quitter l’écran » marque immédiatement ta place hors ligne. Rouvre le salon pour reprendre. Sur Proxmox, l’état est sauvegardé dans `/var/lib/jeux/donnees`. Tu peux rouvrir ta session après un redémarrage ou une mise à jour. Le serveur retire les salons après 24 heures sans activité.

L’interface utilise le [kit Encre](https://github.com/SuperNon0/Biblioth-que-de-filme/tree/claude/project-thread-vegilo) avec ses icônes et ses polices locales.

## Remplacer les annonces

Les annonces fournies sont dans [public/audio](public/audio). Pour modifier une annonce, remplace le fichier par un autre MP3 du même nom. Par exemple, remplace `le-village-sendort.mp3` pour l’annonce de début de nuit ou `election-maire.mp3` pour l’ouverture de l’élection. Le serveur lit les fichiers sur disque et les navigateurs vérifient leur fraîcheur. Aucun service de synthèse n’est requis pendant les parties.

Une pause de 2 secondes sépare les annonces. Le mode discret joue les transitions communes et masque les appels individuels de nuit. Les consignes des rôles concernés restent disponibles sur leurs écrans privés.

### Annonces ajoutées en 0.2.1

Les 24 enregistrements d’origine sont conservés. Les annonces ci-dessous sont fournies avec la voix française Tom de Piper. Tu peux les remplacer depuis le panneau Administration.

| Nom du fichier | Phrase |
| --- | --- |
| `fin-voyante.mp3` | La Voyante se rendort. |
| `fin-loups.mp3` | Les Loups-Garous se rendorment. |
| `fin-sorciere.mp3` | La Sorcière se rendort. |
| `aucun-vote-maire.mp3` | Aucun vote n’a été reçu pour l’élection du maire. |
| `aucun-vote-elimination.mp3` | Aucun vote n’a été reçu. Personne n’est éliminé. |
| `egalite-vote-hote.mp3` | L’égalité persiste. Relancez le vote ou tirez au sort parmi les personnes à égalité. |
| `tir-chasseur.mp3` | Le Chasseur a utilisé son dernier tir. Consultez le résultat sur votre téléphone. |
| `match-nul.mp3` | La partie se termine. Aucun camp ne survit. |

## Vérifier

Le test d’import audio utilise `ffmpeg`.

```sh
npm test
```
