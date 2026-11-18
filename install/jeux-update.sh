#!/usr/bin/env bash
set -Eeuo pipefail

application=/opt/jeux
maintenance=/var/lib/jeux/maintenance
demande="$maintenance/commandes/demande"
port="${JEUX_PORT:-3000}"
[[ -e "$demande" ]] || exit 0
exec 9>/run/lock/jeux-deploiement.lock
flock -w 300 9
[[ -e "$demande" ]] || exit 0

travail=$(mktemp -d /opt/.jeux-maj.XXXXXX)
bascule=0
statut() {
  local fichier
  fichier=$(mktemp "$maintenance/.statut.XXXXXX")
  printf '{"statut":"%s","etape":"%s","date":"%s"}\n' "$1" "${2:-}" "$(date -u +%FT%TZ)" > "$fichier"
  chmod 0644 "$fichier"
  mv -f -- "$fichier" "$maintenance/statut.json"
}
terminer() {
  local code=$?
  trap - EXIT
  if (( code != 0 )); then
    if (( bascule )); then statut en-cours restauration || true; fi
    if (( bascule )) && [[ ! -d "$travail/ancienne" ]]; then
      systemctl start jeux.service || true
    elif (( bascule )); then
      systemctl stop jeux.service || true
      if [[ -d "$application" ]]; then mv -T -- "$application" "$travail/echec"; fi
      if mv -T -- "$travail/ancienne" "$application"; then
        systemctl start jeux.service || true
      else
        printf 'Le dossier précédent se trouve dans %s/ancienne.\n' "$travail" >&2
        statut echec || true
        rm -f -- "$demande"
        exit "$code"
      fi
    fi
    statut echec || true
  fi
  rm -f -- "$demande"
  rm -rf -- "$travail"
  exit "$code"
}
trap terminer EXIT
statut en-cours telechargement

curl --fail --silent --show-error --location --retry 3 --max-time 120 \
  --proto '=https' --proto-redir '=https' -o "$travail/jeux.tar.gz" \
  https://codeload.github.com/SuperNon0/Jeux/tar.gz/refs/heads/main
if ! tar -xOzf "$travail/jeux.tar.gz" Jeux-main/install/jeux-update.sh >/dev/null 2>&1; then
  statut pas-de-version
  exit 0
fi
sha=$(sha256sum "$travail/jeux.tar.gz" | cut -d ' ' -f 1)
if [[ -f "$application/.archive-sha256" && $(<"$application/.archive-sha256") == "$sha" ]]; then
  statut deja-a-jour
  exit 0
fi

statut en-cours preparation
nouvelle="$travail/nouvelle"
install -d -m 0755 "$nouvelle"
fichiers=(package.json package-lock.json partie.mjs regles.mjs serveur.mjs public)
tar -xzf "$travail/jeux.tar.gz" -C "$nouvelle" --strip-components=1 --no-same-owner --no-same-permissions \
  "${fichiers[@]/#/Jeux-main/}"
export PATH="/opt/jeux-node/bin:$PATH"
cd "$nouvelle"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node --check serveur.mjs
node --check public/app.js
printf '%s\n' "$sha" > .archive-sha256
chmod -R a+rX "$nouvelle"
cd /
statut en-cours redemarrage
systemctl stop jeux.service
bascule=1
mv -T -- "$application" "$travail/ancienne"
mv -T -- "$nouvelle" "$application"
systemctl start jeux.service
statut en-cours verification
curl --fail --silent --show-error --max-time 3 --retry 7 --retry-connrefused \
  "http://127.0.0.1:$port/sante" -o /dev/null
bascule=0
statut terminee
