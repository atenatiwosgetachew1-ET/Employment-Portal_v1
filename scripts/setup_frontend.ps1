$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $scriptRoot "..\\frontend"

Push-Location $frontendRoot
try {
  npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install frontend npm dependencies."
  }
}
finally {
  Pop-Location
}

Write-Host "Frontend dependencies are installed."
