$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

param(
    [string]$Port
)

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

function Resolve-ArduinoPort {
    param([string]$PreferredPort)

    if ($PreferredPort) {
        return $PreferredPort
    }

    $boardList = & arduino-cli board list --format json | ConvertFrom-Json
    if (-not $boardList) {
        throw 'No serial devices found. Connect the board and try again.'
    }

    $matching = @($boardList | Where-Object {
        $_.fqbn -eq 'arduino:avr:uno' -or $_.matching_boards.name -contains 'Arduino Uno'
    })

    if ($matching.Count -gt 0 -and $matching[0].port.address) {
        return $matching[0].port.address
    }

    $firstPort = @($boardList | Where-Object { $_.port.address }) | Select-Object -First 1
    if ($firstPort -and $firstPort.port.address) {
        return $firstPort.port.address
    }

    throw 'Could not determine a serial port from `arduino-cli board list`.'
}

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

$Port = Resolve-ArduinoPort $Port

Write-Host "JuliansProject Windows quickstart" -ForegroundColor Green
Write-Host "Using serial port $Port." -ForegroundColor Green

Write-Step 'Compiling sketch for Arduino Uno'
& arduino-cli compile --fqbn arduino:avr:uno $SketchPath | Out-Host

Write-Step "Uploading sketch to $Port"
& arduino-cli upload -p $Port --fqbn arduino:avr:uno $SketchPath | Out-Host

Write-Step "Starting localhost UI on $Port"
Set-Location $RepoRoot
$env:MOTOR_UI_SERIAL_PORT = $Port
$env:MOTOR_UI_HOST = '127.0.0.1'
$env:MOTOR_UI_PORT = '8744'
$env:MOTOR_UI_BAUD = '115200'

if ($pythonKind -eq 'py') {
    & $python -3 serve.py
} else {
    & $python serve.py
}

Write-Host "Open $UiUrl if the browser did not open automatically." -ForegroundColor Yellow
