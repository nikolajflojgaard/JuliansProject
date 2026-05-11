# Windows COM4 quick start

Use this if your Arduino shows up as the CH340 / USB serial port on `COM4`.

Fastest option:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-com4-quickstart.ps1
```

Manual fallback from the repo root:

```powershell
arduino-cli compile --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
arduino-cli upload -p COM4 --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
$env:MOTOR_UI_SERIAL_PORT="COM4"
python serve.py
```

Then open:

```text
http://127.0.0.1:8744
```

## If upload fails

Close anything that may already own the port:
- Arduino IDE
- Serial Monitor
- another `python serve.py` window
- any `arduino-cli monitor` session

Then unplug/replug the board and try again.

## If COM4 changes

Check the port again with:

```powershell
arduino-cli board list
```

If it shows a different port, replace `COM4` in the commands above.
