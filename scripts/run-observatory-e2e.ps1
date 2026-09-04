[CmdletBinding()]
param(
  [string]$Grep = "@observatory",
  [string]$Project = "",
  [ValidateRange(1024, 65535)]
  [int]$Port = 3100,
  [switch]$Lightweight
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nextEntry = Join-Path $root "node_modules\next\dist\bin\next"
$playwright = Join-Path $root "node_modules\.bin\playwright.cmd"
$logBase = Join-Path ([System.IO.Path]::GetTempPath()) "deepgram-observatory-e2e-$PID"
$stdoutLog = "$logBase.out.log"
$stderrLog = "$logBase.err.log"
$server = $null
$testExitCode = 1

function Test-ObservatoryServer {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-ObservatoryServer) {
  throw "Port $Port is already serving HTTP. Choose another port or stop that process before running the isolated Observatory suite."
}

try {
  # The test server and browser suite cannot inherit a real credential. Every
  # Deepgram interaction in this suite is fulfilled by Playwright route mocks.
  $env:DEEPGRAM_API_KEY = ""
  $env:PLAYWRIGHT_E2E = "0"
  $env:PLAYWRIGHT_EXTERNAL_SERVER = "1"
  $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$Port"
  if ($Lightweight) { $env:PLAYWRIGHT_LIGHTWEIGHT = "1" }

  $server = Start-Process `
    -FilePath (Get-Command node).Source `
    -ArgumentList @($nextEntry, "start", "--hostname", "127.0.0.1", "--port", "$Port") `
    -WorkingDirectory $root `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-ObservatoryServer)) {
    if ($server.HasExited) {
      $details = Get-Content $stderrLog -Raw -ErrorAction SilentlyContinue
      throw "The credential-free Observatory test server exited before becoming ready. $details"
    }
    if ((Get-Date) -gt $deadline) {
      throw "Timed out waiting for the credential-free Observatory test server on port $Port."
    }
    Start-Sleep -Milliseconds 250
    $server.Refresh()
  }

  $playwrightArguments = @("test", "--config", "playwright.observatory.config.ts", "--grep", $Grep)
  if ($Project) {
    $playwrightArguments += @("--project", $Project)
  }
  & $playwright @playwrightArguments
  $testExitCode = $LASTEXITCODE
} finally {
  if ($null -ne $server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    $server.WaitForExit(5000) | Out-Null
  }
  Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
}

exit $testExitCode
