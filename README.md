# JuliansProject

A blunt little localhost control panel for an **Arduino Uno motor setup**.

It gives you:
- a local web UI for manual motor control
- quick PWM presets and a live slider
- a live PWM history graph while you drag up and down
- an orange overlay for the reported PID/process variable
- a serial status tail from the board
- optional PID-mode commands for later experiments
- the matching Arduino sketch used for the board

Right now the honest working mode is **manual PWM control**.
The RPM sensor path is still noisy, so closed-loop RPM control is included for experimentation, not trust.

---

## What this project is

This repo has two parts:

1. **Arduino sketch**
   - `arduino/arduino-pid-motor-speed-uno/arduino-pid-motor-speed-uno.ino`
   - Motor PWM is on **pin 3**
   - Sensor input is on **pin 2**

2. **Localhost UI**
   - `serve.py`
   - opens a small web app on your machine
   - talks to the Arduino over serial using `arduino-cli monitor`

---

## What we found during testing

Manual sweep results on the current setup:

- **0–50** → mostly dead / unreliable
- **~60** → startup threshold
- **65–80** → low usable range
- **90–120** → solid normal range
- **150–255** → high / near max

Important: the reported RPM values are still garbage on the current sensor setup, so do **not** trust PID behavior yet.

---

## Requirements

### macOS
- Python 3
- [`arduino-cli`](https://arduino.github.io/arduino-cli/latest/)
- an Arduino Uno connected over USB

### Arduino CLI check

```bash
arduino-cli version
arduino-cli board list
```

If your Uno is connected, `arduino-cli board list` should show something like:

```bash
/dev/cu.usbmodem31201 Arduino UNO arduino:avr:uno
```

---

## Repo layout

```text
.
├── README.md
├── app.js
├── index.html
├── serve.py
├── styles.css
└── arduino/
    └── arduino-pid-motor-speed-uno/
        └── arduino-pid-motor-speed-uno.ino
```

---

## 1. Flash the Arduino sketch

Find your board first:

```bash
arduino-cli board list
```

Compile:

```bash
arduino-cli compile --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
```

Upload:

```bash
arduino-cli upload -p /dev/cu.usbmodem31201 --fqbn arduino:avr:uno arduino/arduino-pid-motor-speed-uno
```

Replace the serial port if your machine shows a different one.

---

## 2. Run the localhost UI

From the repo root:

```bash
python3 serve.py
```

Then open:

```text
http://127.0.0.1:8744
```

---

## Optional environment variables

You can override the defaults if your port or host is different:

```bash
MOTOR_UI_HOST=127.0.0.1 \
MOTOR_UI_PORT=8744 \
MOTOR_UI_SERIAL_PORT=/dev/cu.usbmodem31201 \
MOTOR_UI_BAUD=115200 \
python3 serve.py
```

---

## How to use it

### Manual mode
This is the mode you should trust right now.

Use the UI to:
- drag the PWM slider
- click preset buttons
- hit **Stop** to send PWM 0

### PID mode
PID mode is wired in, but the RPM feedback is still wrong.
Use only if you are debugging the sensor path.

---

## Serial commands the board understands

The sketch accepts commands like:

- `M1` → manual mode
- `M0` → PID mode
- `O65` → set PWM to 65
- `O0` → stop motor
- `T120` → set RPM target to 120
- `P1.4` → set proportional gain
- `I0.25` → set integral gain
- `D0.04` → set derivative gain

---

## Safety notes

- The UI defaults are meant to be sane, not magical.
- Manual mode is safer than fake closed-loop control.
- Start low and step up.
- If the motor is behaving weirdly, hit **Stop** first.
- If the board is busy, make sure no other serial monitor is holding the port open.

---

## Troubleshooting

### UI loads but motor does nothing
Usually one of these:

1. wrong serial port
2. Arduino not flashed with the matching sketch
3. another serial monitor already owns the port
4. motor driver wiring is wrong

Check port ownership:

```bash
lsof -nP | grep usbmodem
```

### `Resource busy`
Something else already has the serial port open.
Close other terminal monitors or Arduino Serial Monitor first.

### Motor does not start at low PWM
That is expected on this setup.
The tested startup threshold was roughly **PWM 60**.

### RPM values look insane
Correct. The current sensor path is still noisy/wrong.
That is a hardware/signal-conditioning problem still to solve.

---

## Next improvements

Good next steps if you want to keep building:

- fix the RPM sensor path properly
- make `PULSES_PER_REV` accurate for the sensor
- add percent-power mode in the UI
- add ramp-up / ramp-down controls
- add startup boost logic
- save presets in the browser

---

## Quick start

If you just want it running fast:

```bash
git clone <YOUR-REPO-URL>
cd JuliansProject
python3 serve.py
```

Open:

```text
http://127.0.0.1:8744
```

Then try:
- **60**
- **75**
- **100**
- **Stop**
