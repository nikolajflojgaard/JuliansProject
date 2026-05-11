$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SketchPath = Join-Path $RepoRoot 'arduino\arduino-pid-motor-speed-uno'
$UiScript = Join-Path $RepoRoot 'serve.py'
$UiUrl = 'http://127.0.0.1:8744'

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

function Invoke-Python($PythonInfo, [string[]]$Arguments) {
    if ($PythonInfo.Kind -eq 'py') {
        & $PythonInfo.Path -3 @Arguments
    } else {
        & $PythonInfo.Path @Arguments
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
    foreach ($line in $lines) {
        if ($line -match '^(COM\d+)\s+.*arduino:avr:uno') {
            return $matches[1]
        }
        if ($line -match '^(COM\d+)\s+.*Arduino\s+UNO') {
            return $matches[1]
        }
    }

    throw @"
Could not find an Arduino Uno COM port.

Make sure:
- the Uno is plugged in with a real USB data cable
- the board powers on
- no other serial monitor is holding the port open

Then run this again.
"@
}

function Upload-Sketch($ArduinoCliPath, $Port) {
    Write-Step "Compiling sketch for Arduino Uno"
    & $ArduinoCliPath compile --fqbn arduino:avr:uno $SketchPath | Out-Host

    Write-Step "Uploading sketch to $Port"
    & $ArduinoCliPath upload -p $Port --fqbn arduino:avr:uno $SketchPath | Out-Host
}

function Start-Ui($PythonInfo, $Port) {
    Write-Step 'Starting localhost UI'

    $pythonExecutable = $PythonInfo.Path
    $pythonArgs = if ($PythonInfo.Kind -eq 'py') { '-3 serve.py' } else { 'serve.py' }

    $command = @(
        '$env:MOTOR_UI_SERIAL_PORT="' + $Port + '"',
        '$env:MOTOR_UI_HOST="127.0.0.1"',
        '$env:MOTOR_UI_PORT="8744"',
        '$env:MOTOR_UI_BAUD="115200"',
        'Set-Location "' + $RepoRoot + '"',
        '& "' + $pythonExecutable + '" ' + $pythonArgs
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
Open-Browser

Write-Host "`nDone. The UI should open at $UiUrl" -ForegroundColor Green
Write-Host "Detected board port: $port" -ForegroundColor Green
Write-Host 'If the browser opens but the motor does not respond, close other serial tools and run the script again.' -ForegroundColor Yellow
