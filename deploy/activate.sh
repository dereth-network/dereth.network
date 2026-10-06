#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

app_root=${1:?Project path required}
release_id=${2:?Release ID required}
archive_sha=${3:?Archive SHA-256 required}
node_version=${4:?Node version required}
node_sha=${5:?Node SHA-256 required}
app_port=${6:?Port required}

[[ "$app_root" == "$HOME/"* && "$app_root" != *'/../'* && "$app_root" != *'/./'* ]] || exit 1
[[ "$release_id" =~ ^[A-Za-z0-9-]+$ && "$node_version" =~ ^24\.[0-9]+\.[0-9]+$ ]] || exit 1
[[ "$archive_sha" =~ ^[a-f0-9]{64}$ && "$node_sha" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$app_port" =~ ^[0-9]+$ && "$app_port" -ge 1024 && "$app_port" -le 65535 ]] || exit 1
[[ $(uname -m) == x86_64 ]] || { echo 'This target uses the Linux x64 Node binary.' >&2; exit 1; }
app_root=$(realpath "$app_root")
[[ "$app_root" == "$HOME/"* ]] || exit 1
cd "$app_root"
mkdir -p .runtime releases
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is already running.' >&2; exit 1; }

archive="$app_root/.incoming/$release_id.tar.gz"
bootstrap="$app_root/.incoming/$release_id"
candidate="$app_root/releases/$release_id"
runtime="$app_root/.runtime/node-v$node_version-linux-x64"
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/dereth-network.service"
previous=''
switched=false

wait_healthy() {
  local expected=$1
  for attempt in {1..30}; do
    if systemctl --user is-active --quiet dereth-network && \
      "$runtime/bin/node" --input-type=module -e '
        const response = await fetch(process.argv[1], { signal: AbortSignal.timeout(1000) });
        const health = await response.json();
        process.exit(response.ok && health.status === "ok" && health.release === process.argv[2] ? 0 : 1);
      ' "http://127.0.0.1:$app_port/healthz" "$expected" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if [[ -e current || -L current ]]; then
  [[ -L current ]] || { echo 'current exists but is not a release symlink.' >&2; exit 1; }
  previous=$(readlink -f current)
  [[ "$previous" == "$app_root/releases/"* && -d "$previous" ]] || exit 1
fi
if [[ -e "$unit_file" ]]; then
  grep -q '^# Managed by Dereth Network deploy$' "$unit_file" || {
    echo 'An existing user service is not managed by this deploy script.' >&2; exit 1;
  }
  cp "$unit_file" "$bootstrap/previous.service"
fi

recover() {
  local result=${1:-$?}
  trap - ERR HUP INT TERM
  set +e
  if [[ "$switched" == true ]]; then
    echo 'New release failed. Restoring the previous service.' >&2
    journalctl --user -u dereth-network -n 15 --no-pager >&2
    systemctl --user stop dereth-network
    if [[ -n "$previous" ]]; then
      ln -s "$previous" "$app_root/.current-rollback-$release_id"
      mv -Tf "$app_root/.current-rollback-$release_id" "$app_root/current"
    else
      [[ -L "$app_root/current" ]] && unlink "$app_root/current"
    fi
    if [[ -f "$bootstrap/previous.service" ]]; then
      cp "$bootstrap/previous.service" "$unit_file"
    else
      systemctl --user disable dereth-network
      rm -f -- "$unit_file"
    fi
    systemctl --user daemon-reload
    if [[ -n "$previous" ]]; then
      systemctl --user reset-failed dereth-network
      systemctl --user start dereth-network
      if wait_healthy "$(basename "$previous")"; then
        echo "Restored healthy release $previous" >&2
      else
        echo 'The previous release was restored but is not healthy; inspect the service logs.' >&2
      fi
    fi
  fi
  exit "$result"
}
trap recover ERR
trap 'recover 129' HUP
trap 'recover 130' INT
trap 'recover 143' TERM

printf '%s  %s\n' "$archive_sha" "$archive" | sha256sum --check --status
[[ ! -e "$candidate" ]]
mkdir "$candidate"
tar -xmzf "$archive" -C "$candidate"

if [[ ! -x "$runtime/bin/node" ]]; then
  echo "Installing Node $node_version in the project directory..."
  download="$app_root/.runtime/node-v$node_version-linux-x64.tar.gz"
  curl --fail --silent --show-error --location --retry 3 \
    "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.gz" -o "$download"
  printf '%s  %s\n' "$node_sha" "$download" | sha256sum --check --status
  tar -xzf "$download" -C "$app_root/.runtime"
fi
[[ $("$runtime/bin/node" --version) == "v$node_version" ]]
ln -s "$runtime/bin/node" "$candidate/node"
"$runtime/bin/node" "$candidate/deploy/check-release.mjs" "$candidate"

loginctl enable-linger
[[ $(loginctl show-user "$(id -un)" -p Linger --value) == yes ]]
systemctl --user show-environment >/dev/null

mkdir -p "$unit_dir"
cat > "$bootstrap/new.service" <<EOF
# Managed by Dereth Network deploy
[Unit]
Description=Dereth Network website
After=network.target

[Service]
Type=simple
WorkingDirectory=$app_root
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$app_port
Environment=DERETH_RELEASE_ID=$release_id
ExecStart=$runtime/bin/node $app_root/current/server.mjs
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
UMask=0077

[Install]
WantedBy=default.target
EOF

# The candidate is complete before the running service or current symlink changes.
switched=true
if [[ -n "$previous" ]]; then systemctl --user stop dereth-network; fi
ln -s "$candidate" "$app_root/.current-$release_id"
mv -Tf "$app_root/.current-$release_id" "$app_root/current"
cp "$bootstrap/new.service" "$unit_file"
systemctl --user daemon-reload
systemctl --user enable dereth-network
systemctl --user reset-failed dereth-network
systemctl --user restart dereth-network

wait_healthy "$release_id"
curl --fail --silent --show-error "http://127.0.0.1:$app_port/" -o /dev/null
switched=false
trap - ERR HUP INT TERM
echo "Release $release_id is running on 0.0.0.0:$app_port."
