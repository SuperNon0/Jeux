#!/usr/bin/env bash
set -Eeuo pipefail

source_script=$(realpath -- "${BASH_SOURCE[0]}")
projet=$(dirname -- "$source_script")
fichiers=(package.json package-lock.json partie.mjs regles.mjs serveur.mjs public install/jeux-install.sh)
marqueur='__ARCHIVE_JEUX_BASE64__'
ligne_archive() { awk -v marqueur="$marqueur" '$0 == marqueur { print NR+1; exit }' "$source_script"; }

if [[ ${1:-} == --emballer ]]; then
  [[ $# == 2 ]] || { echo "Usage : $0 --emballer /chemin/installer-jeux.run" >&2; exit 1; }
  sortie=$(realpath -m -- "$2")
  [[ ! -e "$sortie" ]] || { echo "Le fichier $sortie existe déjà." >&2; exit 1; }
  [[ -z $(ligne_archive) ]] || { echo 'Ce script contient déjà le jeu.' >&2; exit 1; }
  temporaire=$(mktemp "${sortie}.XXXXXX")
  trap 'rm -f -- "$temporaire"' EXIT
  {
    cat "$source_script"
    printf '%s\n' "$marqueur"
    tar -C "$projet" -czf - "${fichiers[@]}" | base64
  } > "$temporaire"
  mv -n -- "$temporaire" "$sortie"
  printf 'Installateur créé : %s\n' "$sortie"
  exit 0
fi

if [[ $# != 0 ]]; then
  echo "Usage : $0" >&2
  exit 1
fi

erreur() { printf '%s\n' "$*" >&2; exit 1; }
for outil in pct pveam pvesm pvesh ip; do
  command -v "$outil" >/dev/null || erreur "Lance ce script dans le shell de l’hôte Proxmox VE. Commande manquante : $outil."
done
[[ $EUID == 0 ]] || erreur 'Lance ce script avec le compte root de Proxmox.'

pont=${BRIDGE:-vmbr0}
port=${JEUX_PORT:-3000}
nom=${CT_HOSTNAME:-jeux}
reseau=${IP_CONFIG:-dhcp}
[[ $pont =~ ^[a-zA-Z0-9_.-]+$ ]] && ip link show dev "$pont" >/dev/null 2>&1 ||
  erreur "Le pont $pont est introuvable. Indique le pont LAN avec BRIDGE."
[[ $nom =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || erreur 'CT_HOSTNAME doit être un nom DNS simple.'
[[ $port =~ ^[1-9][0-9]{0,4}$ ]] && (( port >= 1024 && port <= 65535 )) ||
  erreur 'JEUX_PORT doit être un port entre 1024 et 65535.'
[[ $reseau == dhcp || $reseau =~ ^[0-9.]+/[0-9]+(,gw=[0-9.]+)?$ ]] ||
  erreur 'IP_CONFIG doit valoir dhcp, ou une adresse IPv4/CIDR éventuellement suivie de ,gw=PASSERELLE.'

stockage_actif() {
  pvesm status --content "$1" | awk 'NR > 1 && $3 == "active" {print $1}'
}
disques=$(stockage_actif rootdir)
modeles=$(stockage_actif vztmpl)
stockage_disque=${STORAGE:-$(awk 'BEGIN{premier=""} NF{if(!premier)premier=$1;if($1=="local-lvm")pref=$1} END{print pref?pref:premier}' <<< "$disques")}
stockage_modele=${TEMPLATE_STORAGE:-$(awk 'BEGIN{premier=""} NF{if(!premier)premier=$1;if($1=="local")pref=$1} END{print pref?pref:premier}' <<< "$modeles")}
[[ -n $stockage_disque ]] && grep -Fxq "$stockage_disque" <<< "$disques" || erreur 'Aucun stockage actif pour les disques LXC. Vérifie STORAGE.'
[[ -n $stockage_modele ]] && grep -Fxq "$stockage_modele" <<< "$modeles" || erreur 'Aucun stockage actif pour les modèles LXC. Vérifie TEMPLATE_STORAGE.'

ctid=${CTID:-$(pvesh get /cluster/nextid)}
[[ $ctid =~ ^[1-9][0-9]{2,8}$ ]] || erreur "Identifiant Proxmox invalide : $ctid."
pvesh get /cluster/nextid --vmid "$ctid" >/dev/null || erreur "L’identifiant $ctid est déjà utilisé ou indisponible."

case $(uname -m) in
  x86_64) architecture=amd64 ;;
  aarch64) architecture=arm64 ;;
  *) erreur 'Architecture Proxmox non prise en charge.' ;;
esac

dossier=$(mktemp -d)
creation=0
nettoyer() {
  local statut=$?
  rm -rf -- "$dossier"
  if (( statut != 0 && creation )); then
    printf 'Installation interrompue. Le conteneur %s est conservé. Vérifie pct status %s et pct exec %s -- journalctl -u jeux -n 50.\n' "$ctid" "$ctid" "$ctid" >&2
  fi
}
trap nettoyer EXIT

debut=$(ligne_archive)
if [[ -n $debut ]]; then
  tail -n "+$debut" "$source_script" | base64 --decode > "$dossier/jeux.tar.gz"
else
  tar -C "$projet" -czf "$dossier/jeux.tar.gz" "${fichiers[@]}"
fi
tar -tzf "$dossier/jeux.tar.gz" > /dev/null

printf 'Téléchargement du modèle Debian 13…\n'
pveam update
liste=$(pveam available --section system)
modele=$(awk -v arch="$architecture" '$2 ~ ("^debian-13-standard_[^ ]+_" arch "\\.tar\\.zst$") {print $2}' <<< "$liste" | sort -V | tail -n 1)
[[ -n $modele ]] || erreur "Aucun modèle Debian 13 disponible pour $architecture. Vérifie le catalogue pveam."
volume="$stockage_modele:vztmpl/$modele"
disponibles=$(pveam list "$stockage_modele")
if ! awk -v volume="$volume" '$1 == volume {trouve=1} END {exit !trouve}' <<< "$disponibles"; then
  pveam download "$stockage_modele" "$modele"
fi

printf 'Création du conteneur %s sur %s…\n' "$ctid" "$pont"
pct create "$ctid" "$volume" --hostname "$nom" --unprivileged 1 \
  --cores 2 --memory 1024 --swap 512 --rootfs "$stockage_disque:8" \
  --net0 "name=eth0,bridge=$pont,ip=$reseau"
creation=1
pct start "$ctid"
pct push "$ctid" "$dossier/jeux.tar.gz" /tmp/jeux-install.tar.gz --perms 0600

tar -xOzf "$dossier/jeux.tar.gz" install/jeux-install.sh > "$dossier/installer-conteneur.sh"
pct push "$ctid" "$dossier/installer-conteneur.sh" /tmp/jeux-install.sh --perms 0600
pct exec "$ctid" -- bash /tmp/jeux-install.sh "$port"
pct exec "$ctid" -- rm -f /tmp/jeux-install.sh

pct set "$ctid" --onboot 1
adresse=$(pct exec "$ctid" -- ip -4 -o addr show dev eth0 scope global | awk 'NR == 1 {split($4,a,"/"); print a[1]}')
printf '\nConteneur %s prêt.\n' "$ctid"
if [[ -n $adresse ]]; then
  printf 'Depuis un téléphone connecté au même réseau : http://%s:%s/\n' "$adresse" "$port"
else
  printf 'Le service répond dans le conteneur. Aucune adresse IPv4 LAN détectée sur eth0.\n'
  printf 'Pour afficher les adresses : pct exec %s -- ip -brief address\n' "$ctid"
fi
exit 0
