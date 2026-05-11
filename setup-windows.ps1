$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SketchPath = Join-Path $RepoRoot 'arduino\arduino-pid-motor-speed-uno'
$UiScript = Join-Path $RepoRoot 'serve.py'
$UiUrl = 'http://127.0.0.1:8744'
$LogDir = Join-Path $RepoRoot 'logs'
$UiLogPath = Join-Path $LogDir 'windows-ui.log'

function Write-Step($Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-CommandPath($Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Ensure-Winget {
    if (-not (Find-CommandPath 'winget')) {
        throw 'winget is required on Windows for one-step setup, but it was not found.'
    }
}

function Install-WithWinget($Id, $Name) {
    Write-Step "Installing $Name with winget"
    winget install --id $Id --exact --scope user --accept-package-agreements --accept-source-agreements | Out-Host
}

function Ensure-ArduinoCli {
    $path = Find-CommandPath 'arduino-cli'
    if ($path) { return $path }

    Ensure-Winget
    Install-WithWinget 'ArduinoSA.CLI' 'arduino-cli'

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\arduino-cli.exe'),
        (Join-Path $env:USERPROFILE 'AppData\Local\Microsoft\WindowsApps\arduino-cli.exe'),
        'C:\Program Files\Arduino CLI\arduino-cli.exe'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    $path = Find-CommandPath 'arduino-cli'
    if ($path) { return $path }

    throw 'arduino-cli installation did not become available in this shell. Re-open PowerShell and run setup-windows.bat again.'
}

function Ensure-Python {
    $py = Find-CommandPath 'py'
    if ($py) { return @{ Kind = 'py'; Path = $py } }

    $python = Find-CommandPath 'python'
    if ($python) { return @{ Kind = 'python'; Path = $python } }

    Ensure-Winget
    Install-WithWinget 'Python.Python.3.12' 'Python 3'

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher\py.exe'),
        (Join-Path $env:USERPROFILE 'AppData\Local\Programs\Python\Launcher\py.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return @{ Kind = 'py'; Path = $candidate } }
    }

    $py = Find-CommandPath 'py'
    if ($py) { return @{ Kind = 'py'; Path = $py } }

    $python = Find-CommandPath 'python'
    if ($python) { return @{ Kind = 'python'; Path = $python } }

    throw 'Python installation did not become available in this shell. Re-open PowerShell and run setup-windows.bat again.'
}

function Ensure-LogDir {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir | Out-Null
    }
}

function Ensure-ArduinoCore($ArduinoCliPath) {
    Write-Step 'Ensuring Arduino AVR core is installed'
    & $ArduinoCliPath core update-index | Out-Host
    $coreList = & $ArduinoCliPath core list
    if ($coreList -notmatch 'arduino:avr') {
        & $ArduinoCliPath core install arduino:avr | Out-Host
    }
}

function Get-UnoPort($ArduinoCliPath) {
    Write-Step 'Detecting Arduino Uno USB port'
    $boardList = & $ArduinoCliPath board list
    $lines = $boardList -split "`r?`n"
    $genericPorts = @()

    foreach ($line in $lines) {
        if ($line -match '^(COM\d+)\s+.*arduino:avr:uno') {
            return $matches[1]
        }
        if ($line -match '^(COM\d+)\s+.*Arduino\s+UNO') {
            return $matches[1]
        }
        if ($line -match '^(COM\d+)\b') {
            $genericPorts += $matches[1]
        }
    }

    $genericPorts = $genericPorts | Select-Object -Unique
    if ($genericPorts.Count -eq 1) {
        Write-Host "Falling back to generic serial port detection: $($genericPorts[0])" -ForegroundColor Yellow
        Write-Host 'This usually means Windows sees a clone board or generic USB serial chip, which is fine.' -ForegroundColor Yellow
        return $genericPorts[0]
    }

    if ($genericPorts.Count -gt 1) {
        throw @"
Found multiple COM ports but could not identify which one is the Arduino Uno.

Visible COM ports:
$($genericPorts -join ", ")

Unplug the board, run `arduino-cli board list`, plug it back in, then run the script again.
That usually makes the new COM port obvious.
"@
    }

    throw @"
Could not find any usable COM port for the Arduino.

Make sure:
- the Uno is plugged in with a real USB data cable
- the board powers on
- Windows has created a COM port for it
- no other serial monitor is holding the port open

If `arduino-cli board list` shows something like `COM3 serial unknown`, this script now accepts that.
If nothing COM-like appears at all, this is still a cable/driver/device problem.
"@
}

function Upload-Sketch($ArduinoCliPath, $Port) {
    Write-Step "Compiling sketch for Arduino Uno"
    & $ArduinoCliPath compile --fqbn arduino:avr:uno $SketchPath | Out-Host

    Write-Step "Uploading sketch to $Port"
    & $ArduinoCliPath upload -p $Port --fqbn arduino:avr:uno $SketchPath | Out-Host
}

function Test-UiReady {
    try {
        $response = Invoke-WebRequest -Uri $UiUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Wait-ForUi {
    Write-Step 'Waiting for localhost UI to come online'
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-UiReady) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Start-Ui($PythonInfo, $Port) {
    Write-Step 'Starting localhost UI'
    Ensure-LogDir

    $pythonExecutable = $PythonInfo.Path
    $pythonArgs = if ($PythonInfo.Kind -eq 'py') { '-3 serve.py' } else { 'serve.py' }

    $command = @(
        '$env:MOTOR_UI_SERIAL_PORT="' + $Port + '"',
        '$env:MOTOR_UI_HOST="127.0.0.1"',
        '$env:MOTOR_UI_PORT="8744"',
        '$env:MOTOR_UI_BAUD="115200"',
        'Set-Location "' + $RepoRoot + '"',
        '& "' + $pythonExecutable + '" ' + $pythonArgs + ' *>> "' + $UiLogPath + '"'
    ) -join '; '

    Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $command | Out-Null
}

function Open-Browser {
    Write-Step 'Opening browser'
    Start-Process $UiUrl | Out-Null
}

Write-Host 'JuliansProject Windows setup' -ForegroundColor Green
Write-Host 'Goal: plug in the Uno, run this script, get the localhost UI.' -ForegroundColor Green

$pythonInfo = Ensure-Python
$arduinoCliPath = Ensure-ArduinoCli
Ensure-ArduinoCore $arduinoCliPath
$port = Get-UnoPort $arduinoCliPath
Upload-Sketch $arduinoCliPath $port
Start-Ui $pythonInfo $port

if (Wait-ForUi) {
    Open-Browser
    Write-Host "`nDone. The UI should open at $UiUrl" -ForegroundColor Green
} else {
    Write-Host "`nThe UI process was started, but localhost did not respond in time." -ForegroundColor Yellow
    Write-Host "Check the log here: $UiLogPath" -ForegroundColor Yellow
}

Write-Host "Detected board port: $port" -ForegroundColor Green
Write-Host 'If the browser opens but the motor does not respond, close other serial tools and run the script again.' -ForegroundColor Yellow
