$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SketchPath = Join-Path $RepoRoot 'arduino\arduino-pid-motor-speed-uno'
$UiUrl = 'http://127.0.0.1:8744'

function Write-Step($Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-CommandPath($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Ensure-Command($Name, $InstallHint) {
    $path = Find-CommandPath $Name
    if (-not $path) {
        throw "$Name was not found. $InstallHint"
    }
    return $path
}

Write-Host 'JuliansProject COM4 quickstart' -ForegroundColor Green
Write-Host 'This script assumes your board is on COM4.' -ForegroundColor Green

$null = Ensure-Command 'arduino-cli' 'Install arduino-cli or run setup-windows.bat first.'
$python = Find-CommandPath 'py'
$pythonKind = 'py'
if (-not $python) {
    $python = Find-CommandPath 'python'
    $pythonKind = 'python'
}
if (-not $python) {
    throw 'Python was not found. Install Python or run setup-windows.bat first.'
}

Write-Step 'Compiling sketch for Arduino Uno'
& arduino-cli compile --fqbn arduino:avr:uno $SketchPath | Out-Host

Write-Step 'Uploading sketch to COM4'
& arduino-cli upload -p COM4 --fqbn arduino:avr:uno $SketchPath | Out-Host

Write-Step 'Starting localhost UI on COM4'
Set-Location $RepoRoot
$env:MOTOR_UI_SERIAL_PORT = 'COM4'
$env:MOTOR_UI_HOST = '127.0.0.1'
$env:MOTOR_UI_PORT = '8744'
$env:MOTOR_UI_BAUD = '115200'

if ($pythonKind -eq 'py') {
    & $python -3 serve.py
} else {
    & $python serve.py
}

Write-Host "Open $UiUrl if the browser did not open automatically." -ForegroundColor Yellow
