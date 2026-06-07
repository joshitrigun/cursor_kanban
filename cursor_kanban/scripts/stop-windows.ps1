$ErrorActionPreference = "Stop"

$containerName = "pm-mvp"
$existingContainer = docker ps -aq --filter "name=^${containerName}$"

if ($LASTEXITCODE -ne 0) {
  throw "Docker command failed: docker ps -aq --filter name=^${containerName}$"
}

if ($existingContainer) {
  docker rm -f $containerName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker rm -f $containerName"
  }
  Write-Host "Stopped $containerName"
} else {
  Write-Host "Container $containerName is not running"
}