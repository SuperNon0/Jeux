#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
ref=${JEUX_REF:-main}
[[ $ref == main || $ref =~ ^[0-9a-f]{40}$ ]] || { echo 'JEUX_REF doit être main ou un commit GitHub complet.' >&2; exit 1; }
port=${1:-}
if [[ -z $port ]]; then
  precedent=$(systemctl show jeux.service -p Environment --value 2>/dev/null || true)
  port=$(sed -nE 's/(^|.*[[:space:]])PORT=([0-9]+)([[:space:]].*|$)/\2/p' <<< "$precedent")
  port=${port:-3000}
fi
[[ $port =~ ^[1-9][0-9]{0,4}$ ]] && (( port >= 1024 && port <= 65535 )) ||
  { echo 'Indique le port du jeu (1024 à 65535).' >&2; exit 1; }

exec 9>/run/lock/jeux-deploiement.lock
flock -n 9 || { echo 'Un autre déploiement de Jeux est en cours.' >&2; exit 1; }

printf 'Installation de Node.js et du jeu…\n'
apt-get -o Acquire::Retries=5 update
apt-get -o Acquire::Retries=5 install -y --no-install-recommends ca-certificates curl xz-utils iproute2 ffmpeg

case $(uname -m) in
  x86_64) arch=x64; sha=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6 ;;
  aarch64) arch=arm64; sha=dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e ;;
  *) echo 'Architecture Node.js non prise en charge.' >&2; exit 1 ;;
esac
version=v24.22.1
archive="node-$version-linux-$arch.tar.xz"
tmp=$(mktemp -d /opt/.jeux-install.XXXXXX)
application=/opt/jeux
nouvelle="$tmp/nouvelle"
bascule=0
terminer() {
  local code=$?
  trap - EXIT
  if (( code != 0 && bascule )); then
    systemctl stop jeux.service || true
    if [[ -d "$tmp/ancienne" ]]; then
      if [[ -d "$application" ]]; then mv -T -- "$application" "$tmp/echec"; fi
      if ! mv -T -- "$tmp/ancienne" "$application"; then
        echo "La version précédente est conservée dans $tmp/ancienne." >&2
        exit "$code"
      fi
      systemctl start jeux.service || true
    fi
  fi
  rm -rf -- "$tmp"
  exit "$code"
}
trap terminer EXIT

if [[ $(/opt/jeux-node/bin/node -v 2>/dev/null || true) != "$version" ]]; then
  curl --fail --silent --show-error --location --retry 4 --retry-connrefused --max-time 180 \
    --proto '=https' --proto-redir '=https' -o "$tmp/$archive" "https://nodejs.org/dist/$version/$archive"
  printf '%s  %s\n' "$sha" "$tmp/$archive" | sha256sum --check -
  install -d -m 0755 /opt/jeux-node
  tar -xJf "$tmp/$archive" -C /opt/jeux-node --strip-components=1 --no-same-owner
fi

install -d -m 0755 "$nouvelle"
if [[ -f /tmp/jeux-install.tar.gz ]]; then
  tar -xzf /tmp/jeux-install.tar.gz -C "$nouvelle" --no-same-owner --no-same-permissions
else
  curl --fail --silent --show-error --location --retry 4 --max-time 120 \
    --proto '=https' --proto-redir '=https' -o "$tmp/jeux.tar.gz" \
    "https://codeload.github.com/SuperNon0/Jeux/tar.gz/$ref"
  if [[ $ref == main ]]; then prefixe=Jeux-main; else prefixe="Jeux-$ref"; fi
  fichiers=(package.json package-lock.json partie.mjs regles.mjs serveur.mjs public install/jeux-update.sh)
  tar -xzf "$tmp/jeux.tar.gz" -C "$nouvelle" --strip-components=1 --no-same-owner --no-same-permissions \
    "${fichiers[@]/#/$prefixe/}"
  sha256sum "$tmp/jeux.tar.gz" | cut -d ' ' -f 1 > "$nouvelle/.archive-sha256"
fi
export PATH="/opt/jeux-node/bin:$PATH"
cd "$nouvelle"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node --check serveur.mjs
node --check public/app.js
chmod -R a+rX "$nouvelle"
cd /
id -u jeux >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin jeux
install -d -m 0755 /var/lib/jeux /var/lib/jeux/maintenance /usr/local/lib/jeux
install -d -m 0750 -o jeux -g jeux /var/lib/jeux/audio /var/lib/jeux/maintenance/commandes
install -d -m 0700 -o jeux -g jeux /var/lib/jeux/donnees
install -m 0755 "$nouvelle/install/jeux-update.sh" /usr/local/lib/jeux/jeux-update.sh

cat > /etc/systemd/system/jeux.service <<UNIT
[Unit]
Description=Jeux - Loup-Garou
After=network.target

[Service]
Type=simple
User=jeux
Group=jeux
WorkingDirectory=/opt/jeux
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$port
Environment=JEUX_ETAT=/var/lib/jeux
ExecStart=/opt/jeux-node/bin/node /opt/jeux/serveur.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/jeux-update.service <<UNIT
[Unit]
Description=Mise à jour de Jeux depuis son dépôt GitHub

[Service]
Type=oneshot
Environment=JEUX_PORT=$port
ExecStart=/usr/local/lib/jeux/jeux-update.sh
TimeoutStartSec=600
UNIT

cat > /etc/systemd/system/jeux-update.path <<'UNIT'
[Unit]
Description=Surveiller les demandes de mise à jour de Jeux

[Path]
PathExists=/var/lib/jeux/maintenance/commandes/demande

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
if [[ -d "$application" ]]; then
  systemctl stop jeux.service
  mv -T -- "$application" "$tmp/ancienne"
  bascule=1
fi
mv -T -- "$nouvelle" "$application"
systemctl enable --now jeux.service
curl --fail --silent --show-error --max-time 5 --retry 8 --retry-connrefused \
    "http://127.0.0.1:$port/sante"
printf '\n'
bascule=0
rm -f /tmp/jeux-install.tar.gz
systemctl enable --now jeux-update.path
