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
- **Lien invité**. Ouvre le QR code créé par l’hôte et choisis ton prénom dans la liste, sans demande d’e-mail.
- **Diagnostic**. Depuis le LXC, `curl -fsS http://127.0.0.1:3000/sante` indique la version et l’état du service. Avec Cloudflare activé, ouvre le site via l’un des deux sous-domaines. Un code 421 sur l’un de ces liens indique généralement que le nom d’hôte transmis à Jeux diffère de celui configuré.

[Documentation Cloudflare Access et Tunnel](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)

### Panneau d’administration

Une fois connecté au lien hôte, ouvre **Administration** pour voir tous les salons du serveur, y compris les salons en pause. Le panneau affiche leur état et le nombre de joueurs, sans afficher leurs cartes ni leurs votes.

- **Tous les salons** permet de terminer un salon et de garder son entrée dans le panneau. **Supprimer** retire définitivement le salon et les accès des joueurs. Les salons restent dans le panneau jusqu’à leur suppression manuelle.
- **Créer un salon → Compositions partagées** permet d’enregistrer une configuration pour la retrouver sur le lien hôte depuis un autre navigateur. Pour la modifier, charge-la dans **Composition rapide**, change les règles et choisis **Mettre à jour la composition**.
- **Essayer la démo** ouvre une partie privée avec quatre joueurs simulés, y compris l’élection du maire.
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

- L’hôte choisit une composition prête à jouer ou règle les rôles à la main. Les compositions favorites sont gardées sur le navigateur.
- Le formulaire règle les chronomètres en minutes. Par défaut, le débat dure 2 minutes, les votes et chaque choix de rôle 1 minute. Dans la démo, le débat dure 1 minute et le vote 0,75 minute. Indique 0 pour désactiver un chronomètre.
- Le son est requis au lancement. Le téléphone de l’hôte joue les annonces et les autres écrans affichent le texte de l’annonce en cours. Les commandes et leur minuteur apparaissent après cette annonce. Si la lecture est interrompue, l’hôte réactive le son pour reprendre.
- À la fin du délai, les bulletins manquants deviennent des abstentions. Un rôle individuel sans réponse passe son tour. Si le maire laisse expirer un départage, le jeu tire au sort parmi les personnes à égalité. Le débat peut être prolongé de 30 secondes.
- L’hôte et le co-hôte peuvent mettre le jeu en pause et passer les actions des personnes hors ligne après 15 secondes, et celles de tout le monde après 45 secondes.
- Quand le salon est plein, l’hôte peut activer la narration sur son téléphone puis lancer la partie.
- Avant le tirage, **Ajouter un bot** permet à l’hôte de remplir les places libres. Ouvre deux écrans et ajoute trois bots pour essayer une composition de cinq joueurs.
- L’hôte clique sur **Tirer les cartes**. Chaque joueur retourne sa carte et confirme **Je suis prêt**. L’hôte lance alors la partie, active le son et attend la fin du compte à rebours de 10 secondes.
- La Voyante choisit une cible, consulte sa carte en privé, puis confirme **J’ai vu la carte** avant l’annonce de fin de tour.
- L’élection du maire est activée par défaut dans le formulaire. Elle a lieu après le premier débat et avant le vote d’élimination.
- Le vote d’élimination se clôt après réception de tous les bulletins ou à la fin du minuteur. Chaque joueur peut retourner la carte de la personne éliminée. L’hôte confirme le passage à la nuit avant l’annonce « Le village s’endort ».
- Quand le Chasseur est éliminé par le vote ou par les loups, il tire aussitôt, avant le test de victoire. Tué la nuit, son choix s’ouvre au réveil, avant le débat. Si sa mort élimine déjà le dernier loup, le village gagne sans tir.
- Après sa révélation, la Voyante a 20 secondes pour confirmer qu’elle a vu la carte, puis la nuit continue.
- La Sorcière décide d’abord si elle utilise son soin quand il est disponible. Elle peut ensuite choisir une cible pour son poison ou le garder. Chaque choix dispose de son propre chronomètre.
- Après actualisation, le même navigateur retrouve automatiquement sa session. Si elle est perdue, ouvre à nouveau le QR et demande à reprendre ton ancien pseudo. L’hôte doit valider la demande.

Chaque loup voit le choix des autres et peut changer le sien. La victime est fixée dès que toute la meute vise la même personne. Sans accord à la fin du délai, le serveur tire au sort entre les cibles arrivées en tête. Sans maire, un vote d’élimination à égalité est relancé entre les candidats arrivés en tête. Si l’égalité persiste, l’hôte peut relancer le vote ou tirer au sort. Le village gagne une fois le dernier loup éliminé. Les loups gagnent lorsqu’ils sont au moins aussi nombreux que les autres survivants, sauf si un couple de camps opposés est encore en jeu.

### Rôles optionnels

Active ces rôles dans **Personnaliser les règles** à la création du salon. La composition **Village étendu** les réunit tous pour 12 joueurs.

| Rôle | Pouvoir |
| --- | --- |
| Cupidon | Lie deux personnes la première nuit, lui compris s’il le choisit. Chacune découvre le nom de son partenaire sur son téléphone. Si l’une meurt, l’autre meurt de chagrin. Un couple de camps opposés gagne s’il forme les deux derniers survivants. |
| Salvateur | Protège un joueur de l’attaque des loups, y compris lui-même, avec une cible différente d’une nuit consécutive à l’autre. Il peut passer son tour. |
| Ancien | Survit à la première attaque des loups qui l’atteint. Son pouvoir est passif et le poison ou un vote peuvent l’éliminer. |
| Corbeau | Peut marquer un autre joueur chaque nuit, ou ne marquer personne. Si cette personne survit, la marque est annoncée le lendemain et ajoute deux voix contre elle au premier tour du vote d’élimination. |

## Retrouver un salon

« Mes salons » conserve les invitations et tes places sur ce navigateur. Si tout le monde ferme le jeu, le salon passe en pause après environ 15 secondes, avec ses rôles, ses votes et l’étape en cours. « Quitter l’écran » marque immédiatement ta place hors ligne. Rouvre le salon pour reprendre. Sur Proxmox, l’état est sauvegardé dans `/var/lib/jeux/donnees`. Tu peux rouvrir ta session après un redémarrage ou une mise à jour.

L’interface utilise le [kit Encre](https://github.com/SuperNon0/Biblioth-que-de-filme/tree/claude/project-thread-vegilo) avec ses icônes et ses polices locales.

## Remplacer les annonces

Les annonces fournies sont dans [public/audio](public/audio). Pour modifier une annonce, remplace le fichier par un autre MP3 du même nom. Par exemple, remplace `le-village-sendort.mp3` pour l’annonce de début de nuit ou `election-maire.mp3` pour l’ouverture de l’élection. Le serveur lit les fichiers sur disque et les navigateurs vérifient leur fraîcheur. Aucun service de synthèse n’est requis pendant les parties.

Une pause de 2 secondes sépare les annonces. Le mode discret joue les transitions communes et masque les appels individuels de nuit. Les consignes des rôles concernés restent disponibles sur leurs écrans privés.

### Pistes fournies

Les annonces utilisent la voix française Tom de Piper et un niveau sonore harmonisé. Le jeu fournit aussi un croassement synthétique. Une annonce importée ou associée dans Administration garde la priorité sur la piste fournie.

Dans les nouveaux salons, une élimination confirmée s’annonce en deux pistes : `deces-<prénom>.mp3` (« Noë a perdu la vie. ») puis `role-<rôle>.mp3` (« Son rôle était Corbeau. »). Pour un bot ou un prénom sans piste, seule la piste du rôle est jouée. Toutes les phrases figurent dans le [catalogue des annonces](public/annonces.json).

En narration classique, un rôle de nuit mort ou sans pouvoir (Sorcière sans potion utile) est quand même appelé, puis se rendort après 8 à 14 secondes. Le silence ne trahit donc rien. Le mode discret ne fait aucun appel individuel.

| Nom du fichier | Phrase ou son |
| --- | --- |
| `amoureux-lies.mp3` | Les amoureux découvrent leur lien sur leur téléphone. |
| `ancien-survit.mp3` | L’Ancien a survécu à la morsure des loups. |
| `aucun-vote-elimination.mp3` | Aucun vote n’a été reçu. Personne n’est éliminé. |
| `aucun-vote-maire.mp3` | Aucun vote n’a été reçu pour l’élection du maire. |
| `chasseur.mp3` | Le Chasseur a été éliminé. Il doit choisir une personne à emporter avec lui. |
| `compte-a-rebours.mp3` | La partie commence dans dix secondes. |
| `corbeau.mp3` | Le Corbeau se réveille. Choisis la personne qui recevra deux voix contre elle au prochain vote d’élimination. |
| `cri-corbeau.mp3` | Croassement après la validation de la cible du Corbeau, en narration classique. |
| `cupidon.mp3` | Cupidon se réveille. Choisis deux personnes qui seront liées pour toute la partie. |
| `debut-debat.mp3` | Le débat commence. À vous de parler. |
| `departage-maire.mp3` | Le maire doit départager les joueurs arrivés en tête. |
| `distribution.mp3` | Découvrez votre carte, puis gardez votre rôle secret. Quand vous êtes prêts, confirmez sur votre téléphone. |
| `egalite-election.mp3` | L’élection se termine sur une égalité. L’hôte peut relancer le vote ou lancer un tirage au sort. |
| `egalite-elimination.mp3` | Le vote se termine sur une égalité. |
| `egalite-vote-hote.mp3` | L’égalité persiste. Relancez le vote ou tirez au sort parmi les personnes à égalité. |
| `election-maire.mp3` | Le village doit élire son maire. Votez sur votre téléphone. |
| `fin-corbeau.mp3` | Le Corbeau se rendort. |
| `fin-cupidon.mp3` | Cupidon se rendort. |
| `fin-debat.mp3` | Le débat est terminé. Préparez-vous à voter. |
| `fin-loups.mp3` | Les Loups-Garous se rendorment. |
| `fin-salvateur.mp3` | Le Salvateur se rendort. |
| `fin-sorciere.mp3` | La Sorcière se rendort. |
| `fin-voyante.mp3` | La Voyante se rendort. |
| `le-village-se-reveille.mp3` | Le village se réveille. |
| `le-village-sendort.mp3` | Le village s’endort. |
| `loups.mp3` | Les Loups-Garous se réveillent. Choisissez votre cible. |
| `maire-elu.mp3` | Le village a élu son maire. |
| `marque-corbeau.mp3` | Le Corbeau a laissé une marque. La personne désignée commencera le prochain vote d’élimination avec deux voix contre elle. |
| `match-nul.mp3` | La partie se termine. Aucun camp ne survit. |
| `mort-amoureux.mp3` | Deux personnes étaient liées. La personne encore en jeu a été emportée avec l’autre. |
| `nouveau-maire.mp3` | Le village a un nouveau maire. |
| `nuit-avec-victimes.mp3` | La nuit a fait des victimes. Consultez le résultat sur votre téléphone. |
| `nuit-sans-victime.mp3` | Cette nuit, personne n’a été éliminé. |
| `resultat-vote.mp3` | Le vote est terminé. Consultez le résultat sur votre téléphone. |
| `salvateur.mp3` | Le Salvateur se réveille. Choisis la personne que tu veux protéger cette nuit. |
| `second-tour.mp3` | Le vote reprend. Choisissez parmi les candidats arrivés à égalité. |
| `sorciere.mp3` | La Sorcière se réveille. Tu peux utiliser tes potions ou les garder pour une autre nuit. |
| `succession-maire.mp3` | Le maire a été éliminé. Il doit désigner son successeur. |
| `tir-chasseur.mp3` | Le Chasseur a utilisé son dernier tir. Consultez le résultat sur votre téléphone. |
| `tirage-au-sort.mp3` | Le sort va départager les candidats à égalité. |
| `victoire-amoureux.mp3` | Les amoureux sont les derniers survivants. Ils remportent la partie ensemble. |
| `victoire-loups.mp3` | Les Loups-Garous ont pris le dessus. Ils remportent la partie. |
| `victoire-village.mp3` | Le village a éliminé tous les Loups-Garous. Le village remporte la partie. |
| `vote-elimination.mp3` | Le vote d’élimination est ouvert. Les joueurs encore en jeu peuvent voter sur leur téléphone. |
| `voyante.mp3` | La Voyante se réveille. Choisis la personne dont tu veux découvrir le rôle. |

## Voix du narrateur

Les annonces utilisent la voix française **Tom** de [Piper](https://github.com/OHF-Voice/piper1-gpl), au volume de -19 LUFS. L’action GitHub [Voix du narrateur](.github/workflows/voix.yml) crée les MP3 qui manquent dès qu’une phrase est ajoutée à `public/annonces.json`, sur `main` ou sur une branche `claude/…`, et les enregistre dans `public/audio`. Pour écouter une phrase avant de l’utiliser, écris-la dans `outils/essai.txt` : l’action produit `outils/essais/essai.mp3`.

Sur un ordinateur avec Python et FFmpeg :

```sh
pip install piper-tts==1.8.0
python3 -m piper.download_voices fr_FR-tom-medium --download-dir outils/voix
npm run voix                          # crée les MP3 manquants
npm run voix -- --forcer loups        # refait une phrase modifiée
```

## Ajouter un rôle

Chaque rôle tient dans un fichier de [public/loup-garou/roles](public/loup-garou/roles), lu à la fois par le serveur et par les téléphones : nom, camp, texte de la carte, image, place dans la nuit, phrases du narrateur et crochets du pouvoir (`agir`, `auReveil`, `surAttaque`, `surMort`, `surVote`, `victoire`).

```sh
npm run nouveau-role -- renard "Renard" --nuit --rang 25 --image "un renard roux au regard rusé"
```

Le script crée le fichier du rôle, l’inscrit dans le registre, ajoute ses phrases au catalogue, prépare `tests/renard.test.mjs` et écrit le prompt d’illustration pour ChatGPT dans `outils/prompts/renard.txt`. Il reste à coder le pouvoir, compléter les phrases (`npm run catalogue`) et le test, puis pousser : l’action GitHub crée les voix. Pour l’image, `npm run image-role -- renard image.png` la recadre en carré dans `public/illustrations/roles/`.

## Vérifier

Le test d’import audio utilise `ffmpeg`.

```sh
npm test
```
- Dans les nouveaux salons, chaque personne choisit un prénom distinct parmi Noë, Julien, Maël, Marine, Batiste, Mélissa, Gabi, Enzo et Clara. Des bots peuvent occuper les places libres.
