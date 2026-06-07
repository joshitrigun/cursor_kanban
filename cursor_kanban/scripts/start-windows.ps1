$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$imageName = "pm-mvp"
$containerName = "pm-mvp"
$envFile = Join-Path $repoRoot ".env"

function Invoke-Docker {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  & docker @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Args -join ' ')"
  }
}

Invoke-Docker build -t $imageName $repoRoot

$existingContainer = docker ps -aq --filter "name=^${containerName}$"
if ($LASTEXITCODE -ne 0) {
  throw "Docker command failed: docker ps -aq --filter name=^${containerName}$"
}

if ($existingContainer) {
  Invoke-Docker rm -f $containerName | Out-Null
}

$dockerArgs = @("run", "-d", "--name", $containerName, "-p", "8000:8000")
if (Test-Path $envFile) {
  $dockerArgs += @("--env-file", $envFile)
}
$dockerArgs += $imageName

Invoke-Docker @dockerArgs
Write-Host "Started $containerName at http://127.0.0.1:8000"