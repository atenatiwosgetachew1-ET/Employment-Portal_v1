param(
  [string]$BackendPython = "python"
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupBackend = Join-Path $scriptRoot "setup_backend.ps1"
$setupFrontend = Join-Path $scriptRoot "setup_frontend.ps1"

powershell -ExecutionPolicy Bypass -File $setupBackend -Python $BackendPython
if ($LASTEXITCODE -ne 0) {
  throw "Backend setup failed."
}

powershell -ExecutionPolicy Bypass -File $setupFrontend
if ($LASTEXITCODE -ne 0) {
  throw "Frontend setup failed."
}

Write-Host "Local machine bootstrap completed."
