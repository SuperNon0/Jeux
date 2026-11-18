#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
port=${1:-3000}

printf 'Installation de Node.js et du jeu…\n'
apt-get -o Acquire::Retries=5 update
apt-get -o Acquire::Retries=5 install -y --no-install-recommends ca-certificates curl xz-utils iproute2

case $(uname -m) in
  x86_64) arch=x64; sha=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6 ;;
  aarch64) arch=arm64; sha=dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e ;;
  *) echo 'Architecture Node.js non prise en charge.' >&2; exit 1 ;;
esac
version=v24.22.1
archive="node-$version-linux-$arch.tar.xz"
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
curl --fail --silent --show-error --location --retry 4 --retry-connrefused --max-time 180 \
  --proto '=https' --proto-redir '=https' -o "$tmp/$archive" "https://nodejs.org/dist/$version/$archive"
printf '%s  %s\n' "$sha" "$tmp/$archive" | sha256sum --check -

install -d -m 0755 /opt/jeux-node /opt/jeux
tar -xJf "$tmp/$archive" -C /opt/jeux-node --strip-components=1 --no-same-owner
if [[ -f /tmp/jeux-install.tar.gz ]]; then
  tar -xzf /tmp/jeux-install.tar.gz -C /opt/jeux --no-same-owner
  rm -f /tmp/jeux-install.tar.gz
else
  curl --fail --silent --show-error --location --retry 4 --max-time 120 \
    --proto '=https' --proto-redir '=https' -o "$tmp/jeux.tar.gz" \
    https://codeload.github.com/SuperNon0/Jeux/tar.gz/refs/heads/main
  tar -xzf "$tmp/jeux.tar.gz" -C "$tmp" --no-same-owner
  cp -R "$tmp"/Jeux-main/{package.json,package-lock.json,partie.mjs,regles.mjs,serveur.mjs,public} /opt/jeux/
fi
chmod -R a+rX /opt/jeux
export PATH="/opt/jeux-node/bin:$PATH"
cd /opt/jeux
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
id -u jeux >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin jeux

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
ExecStart=/opt/jeux-node/bin/node /opt/jeux/serveur.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now jeux.service
curl --fail --silent --show-error --max-time 5 --retry 8 --retry-connrefused \
  "http://127.0.0.1:$port/" -o /dev/null
