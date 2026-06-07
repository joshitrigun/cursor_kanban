#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_name="pm-mvp"
container_name="pm-mvp"
env_file="$repo_root/.env"

docker build -t "$image_name" "$repo_root"

if docker ps -aq --filter "name=^${container_name}$" | grep -q .; then
  docker rm -f "$container_name" >/dev/null
fi

docker_args=(run -d --name "$container_name" -p 8000:8000)
if [[ -f "$env_file" ]]; then
  docker_args+=(--env-file "$env_file")
fi
docker_args+=("$image_name")

docker "${docker_args[@]}"
echo "Started $container_name at http://127.0.0.1:8000"