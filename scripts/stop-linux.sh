#!/usr/bin/env bash
set -euo pipefail

container_name="pm-mvp"

if docker ps -aq --filter "name=^${container_name}$" | grep -q .; then
  docker rm -f "$container_name" >/dev/null
  echo "Stopped $container_name"
else
  echo "Container $container_name is not running"
fi