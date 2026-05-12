# Windows quick start

Use this if your Arduino shows up as a USB serial port on Windows.

Fastest option:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-quickstart.ps1
```

If you want to force a specific port:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-quickstart.ps1 -Port COM4
```

Manual fallback from the repo root:

```powershell
arduino-cli board list
arduino-cli compile --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
arduino-cli upload -p COM4 --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
$env:MOTOR_UI_SERIAL_PORT="COM4"
python serve.py
```

Then open:

```text
http://127.0.0.1:8744
```

## Notes

- The script auto-detects the Arduino port when possible.
- If auto-detection picks the wrong port, pass `-Port COMx` explicitly.

## If upload fails

Close anything that may already own the port:
- Arduino IDE
- Serial Monitor
- another `python serve.py` window
- any `arduino-cli monitor` session

Then unplug/replug the board and try again.
