# Code documentation

This file explains the Arduino code in simple language.

The code file it explains is:

- `arduino/arduino-pid-motor-speed-uno/arduino-pid-motor-speed-uno.ino`

---

## Big picture

Imagine you have:

- a **motor**
- a **tiny computer** called an **Arduino Uno**
- a **sensor** that notices when the motor spins

The Arduino is trying to do 3 jobs:

1. **listen** for commands from the computer
2. **spin the motor** faster or slower
3. **measure speed** and report what is happening

So the Arduino is like a tiny robot boss saying:

- “How fast should I go?”
- “What power should I send to the motor?”
- “How fast am I actually spinning?”

---

## The pins: the Arduino's little fingers

At the top of the file, the code picks which pins do which jobs.

```cpp
const byte SENSOR_PIN = 2;
const byte PWM_PIN = 3;
const byte DIR_PIN = 8;
const byte ENABLE_PIN = 7;
```

Think of pins like little plug holes on the Arduino.

- `SENSOR_PIN = 2` → listens to the speed sensor
- `PWM_PIN = 3` → tells the motor how hard to push
- `DIR_PIN = 8` → chooses motor direction
- `ENABLE_PIN = 7` → turns the motor driver on

---

## Important memory boxes

The Arduino keeps some values in memory so it can remember stuff.

### Pulse counting

```cpp
volatile unsigned long pulseCount = 0;
volatile unsigned long lastAcceptedPulseMicros = 0;
volatile unsigned long lastPulseIntervalMicros = 0;
volatile bool hasPulseInterval = false;
```

These help the Arduino count sensor pulses.

A **pulse** is like the sensor saying:

> “Yep, the motor moved!”

- `pulseCount` → how many pulses happened
- `lastAcceptedPulseMicros` → when the last good pulse happened
- `lastPulseIntervalMicros` → how much time was between pulses
- `hasPulseInterval` → whether we have a good time gap saved yet

Why does this matter?
Because speed is really just:

- how many turns happened
- how quickly they happened

---

### Motor control values

```cpp
float targetRPM = 0.0;
float processRPM = 0.0;
float rawRPM = 0.0;
bool manualMode = true;
```

- `targetRPM` → the speed we want
- `processRPM` → the cleaned-up speed the Arduino trusts most
- `rawRPM` → the more messy speed reading before smoothing
- `manualMode` → whether a human is directly choosing motor power

### Super simple version

- `targetRPM` = “goal speed”
- `rawRPM` = “first guess”
- `processRPM` = “calmer, cleaner guess”
- `manualMode` = “human in charge?”

---

## PID values: the correction knobs

```cpp
float kp = 1.4;
float ki = 0.25;
float kd = 0.04;
```

These are the famous **PID** settings.

PID is just a smart way of saying:

> “If I am too slow or too fast, how should I correct myself?”

### Think of riding a bike

If you are going uphill and get too slow, you push harder.
If you are going too fast downhill, you ease off.

PID does that kind of correcting automatically.

- `kp` → reacts to the problem **right now**
- `ki` → remembers if the problem has been happening for a while
- `kd` → watches how fast the problem is changing

You do **not** need to memorize that. Just remember:

- PID = auto-correcting motor brain

---

## Safety and limits

```cpp
const float MAX_VALID_RPM = 6000.0;
const int PWM_MIN = 0;
const int PWM_MAX = 255;
```

These stop the Arduino from believing nonsense or sending impossible values.

- `MAX_VALID_RPM` → “ignore crazy fake speed readings above this”
- `PWM_MIN = 0` → no power
- `PWM_MAX = 255` → full power

That is like telling the Arduino:

> “Stay inside the safe box.”

---

## Small helper functions

The code has little helper tools.

### `clampFloat()` and `clampInt()`

These stop values from going too low or too high.

Example:

- if motor power tries to become `300`
- but max is `255`
- clamp changes it back to `255`

So clamp means:

> “You cannot go outside the fence.”

---

### `minPulseIntervalUs()`

This works out the **smallest believable gap** between pulses.

Why?
Because sensors can sometimes make fake noisy blips.

So this function helps the Arduino say:

> “That pulse came way too quickly. It is probably junk. Ignore it.”

That is smart, because bad sensor data makes bad motor control.

---

### `rpmFromInterval()`

This turns the time between pulses into RPM.

RPM means:

- **revolutions per minute**
- or: **how many spins happen in one minute**

If pulses happen very close together, the motor is spinning fast.
If pulses happen farther apart, the motor is spinning slower.

---

### `rpmFromCount()`

This calculates RPM another way.

Instead of looking at the time between 2 pulses, it asks:

> “How many pulses happened during this short time window?”

So the code has **two ways** to estimate speed.
That is useful because one method can be better than the other in different situations.

---

### `ema()`

This is a smoothing function.

EMA means **Exponential Moving Average**.
That sounds scary, but it just means:

> “Do not freak out over every tiny wobble. Calm the number down.”

Imagine watching a shaky speedometer.
EMA helps make it less jumpy.

---

## The interrupt: catching pulses super fast

```cpp
void countPulse() {
  ...
}
```

This function runs when the sensor pin changes.
It is attached here:

```cpp
attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), countPulse, FALLING);
```

That means:

> “Whenever the sensor sees a falling pulse, quickly run `countPulse()`.”

Why use an interrupt?
Because the motor might spin fast, and the Arduino does not want to miss pulses.

### What `countPulse()` does

- checks the current time
- checks whether the pulse came too soon to be real
- ignores fake/noisy pulses
- saves the time gap between good pulses
- increases the pulse counter

So this function is the **pulse catcher**.

---

## `applyMotorOutput()`

```cpp
void applyMotorOutput(int pwm) {
  analogWrite(PWM_PIN, pwm);
}
```

This sends the chosen power level to the motor.

`analogWrite()` here is used like a fast on/off pattern called **PWM**.

You can think of PWM like this:

- `0` = never push
- `255` = push as hard as possible
- middle values = push part of the time

So PWM is like tapping the gas pedal very fast.

---

## `handleSerialTuning()`

This part listens for commands from the computer.

```cpp
if (!Serial.available()) return;
```

That means:

> “If no message came in, do nothing.”

If a message does come in, the Arduino reads it.

### Commands it understands

- `T120` → set target RPM to 120
- `P1.4` → set P value
- `I0.25` → set I value
- `D0.04` → set D value
- `R1` → set pulses per revolution
- `O120` → set motor power to 120
- `M1` → manual mode on
- `M0` → PID mode on

This is basically the Arduino hearing little text instructions like:

- “set target speed”
- “change the tuning”
- “switch modes”
- “set power now”

After changing something, it prints back an update so the computer knows the new settings.

---

## `setup()` = the getting-ready part

`setup()` runs **once** when the Arduino starts.

It does these jobs:

### 1. Start serial communication

```cpp
Serial.begin(115200);
```

This opens the chat line between the Arduino and the computer.

### 2. Set pin jobs

```cpp
pinMode(SENSOR_PIN, INPUT_PULLUP);
pinMode(PWM_PIN, OUTPUT);
pinMode(DIR_PIN, OUTPUT);
pinMode(ENABLE_PIN, OUTPUT);
```

This tells the Arduino which pins are listeners and which are senders.

### 3. Set motor direction and enable the driver

```cpp
digitalWrite(DIR_PIN, HIGH);
digitalWrite(ENABLE_PIN, HIGH);
analogWrite(PWM_PIN, 0);
```

That means:

- choose one direction
- turn the driver on
- start with motor power at zero

Good. Safe. Sensible.

### 4. Attach the interrupt

```cpp
attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), countPulse, FALLING);
```

Now the Arduino is ready to catch pulses.

### 5. Print startup messages

This helps the computer or user know the board is alive.

---

## `loop()` = the forever part

After `setup()` runs once, `loop()` runs again and again and again forever.

This is the heart of the program.

---

## Step 1: listen for new commands

```cpp
handleSerialTuning();
```

The Arduino first checks whether the computer sent a new instruction.

---

## Step 2: wait for the right timing

```cpp
unsigned long dtMs = nowMs - lastLoopMs;
if (dtMs < LOOP_MS) return;
```

The code waits until enough time has passed.

`LOOP_MS = 100`
means:

- do the big control update every 100 milliseconds
- that is about 10 times each second

Why?
Because doing everything every single microsecond would be messy and unnecessary.

---

## Step 3: safely copy pulse data

The code uses:

```cpp
noInterrupts();
...
interrupts();
```

That means:

> “Pause new pulse updates for one tiny moment so I can copy the numbers safely.”

This avoids half-updated data.

---

## Step 4: figure out the speed

The code calculates:

- `pulseDelta` → how many new pulses happened
- `sinceLastPulseUs` → how long since the last pulse
- `intervalFresh` → whether the interval data is still recent enough to trust

Then it makes two RPM guesses:

- `intervalRPM`
- `countRPM`

Then it chooses how to combine them.

### Why combine them?

Because real sensors are annoying.

Sometimes counting pulses works better.
Sometimes measuring time between pulses works better.

So the code blends them to get a better guess.

---

## Step 5: smooth the speed

```cpp
processRPM = ema(processRPM, rawRPM, alpha);
```

This takes the jumpy `rawRPM` and turns it into calmer `processRPM`.

If the signal goes stale and speed is basically near zero, the code snaps it to zero.

That stops the UI and PID from pretending the motor is still moving when it is not.

---

## Step 6: calculate the error

```cpp
float error = targetRPM - processRPM;
```

Error means:

> “How far away are we from the goal?”

Example:

- goal = 100 RPM
- actual = 70 RPM
- error = 30 RPM

So the Arduino knows it needs more power.

---

## Step 7: update PID memory

```cpp
integral += error * dtSeconds;
derivative = (error - previousError) / dtSeconds;
```

These are the I and D parts of PID.

Again, simple meaning:

- **integral** remembers long-lasting error
- **derivative** watches how quickly the error is changing

Then the integral is clamped so it does not grow wildly out of control.

That is another safety measure.

---

## Step 8: decide who is in charge

### If manual mode is on

```cpp
if (manualMode) {
  pwmOutput = manualPWM;
  applyMotorOutput(pwmOutput);
}
```

That means:

> “The human is driving. Use the chosen power directly.”

### If PID mode is on

```cpp
float pid = (kp * error) + (ki * integral) + (kd * derivative);
```

That means:

> “The auto-control brain is driving now.”

Then the code clamps the result and sends it to the motor.

---

## Step 9: print status

At the end, the Arduino prints things like:

- mode
- target RPM
- process RPM
- raw RPM
- error
- PWM output

That helps the UI show useful live information.

---

## Manual mode vs PID mode

### Manual mode

You choose the motor power directly.

That is simpler and safer.

Example:

- `O60` → low power
- `O120` → medium power
- `O255` → full blast

### PID mode

You choose the target speed, and the Arduino tries to adjust power automatically.

That is smarter in theory, but only works well if the sensor readings are trustworthy.

Right now the repo README already says the sensor path is still noisy, so manual mode is the honest reliable mode.

---

## Why this code is pretty sensible

This sketch is doing a few smart things:

- ignoring impossible pulses
- using two speed estimation methods
- smoothing noisy RPM values
- dropping stale speed to zero
- starting in manual mode for safety
- clamping outputs so values stay sane

So even if the hardware signal is noisy, the code is at least trying not to be stupid about it.

---

## What is probably hardest to understand

If you are new, the trickiest ideas are:

1. **interrupts**
2. **PWM**
3. **PID**
4. **smoothing noisy sensor data**

That is normal. Those are the grown-up parts of the sketch.

---

## Tiny summary of the whole file

If we shrink the whole program into one story, it says:

1. get ready
2. listen for sensor pulses
3. listen for computer commands
4. estimate motor speed
5. clean up the speed reading
6. either:
   - use manual power, or
   - use PID to auto-correct power
7. report what happened
8. repeat forever

---

## If you want to explain it in one sentence

This `.ino` file is a little robot brain that listens, measures, thinks, and tells a motor how hard to spin.
