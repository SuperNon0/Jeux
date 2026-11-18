#!/usr/bin/env bash
# Jeux pour Proxmox VE, avec le moteur de création LXC de Community Scripts.
if [[ $EUID != 0 ]] || ! command -v pveversion >/dev/null || ! command -v pct >/dev/null; then
  echo 'Lance ce script dans le shell Proxmox VE en tant que root.' >&2
  exit 1
fi

APP="Jeux"
var_tags="${var_tags:-jeu;web}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-8}"
var_os="debian"
var_version="13"
var_unprivileged="${var_unprivileged:-1}"

export COMMUNITY_SCRIPTS_CORE_URL="https://raw.githubusercontent.com/community-scripts/core/add3f664d1eec9e4572aa968b86080385aff2c53"
export COMMUNITY_SCRIPTS_URL="https://raw.githubusercontent.com/SuperNon0/Jeux/main"
moteur=$(mktemp) || exit 1
if ! curl -fsSL --retry 3 --proto '=https' --proto-redir '=https' \
    "$COMMUNITY_SCRIPTS_CORE_URL/core/build.func" -o "$moteur"; then
  rm -f "$moteur"
  exit 1
fi
# Empêche le moteur de prendre le dossier temporaire pour une copie locale du projet core.
source <(cat "$moteur") || { rm -f "$moteur"; exit 1; }
rm -f "$moteur"

header_info "$APP"
variables
color
catch_errors

update_script() {
  msg_error 'Lance ce script depuis le shell de l’hôte Proxmox.'
  exit 1
}

start
build_container || exit 1
if [[ -z ${CTID:-} || ${_CS_CREATED_CTID:-} != "$CTID" ]] ||
    ! pct exec "$CTID" -- systemctl is-active --quiet jeux.service; then
  msg_error 'Le service Jeux n’a pas été confirmé dans un nouveau conteneur.'
  exit 1
fi
description
pct set "$CTID" --onboot 1 || exit 1
if [[ ${IP:-} == *:* ]]; then IP="[$IP]"; fi
msg_ok "Jeux est installé dans le conteneur $CTID."
printf '\nAdresse du jeu : http://%s:3000/\n' "${IP:-ADRESSE-IP-DU-CONTENEUR}"
