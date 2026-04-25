param(
  [string]$Python = "python"
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Join-Path $scriptRoot "..\\backend\\portal"
$venvRoot = Join-Path $backendRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\\python.exe"
$requirementsPath = Join-Path $backendRoot "requirements.txt"

if (-not (Test-Path -LiteralPath $venvPython)) {
  & $Python -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the backend virtual environment."
  }
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "Could not upgrade pip in the backend virtual environment."
}

& $venvPython -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) {
  throw "Could not install backend requirements."
}

Write-Host "Backend environment is ready at $venvRoot"
