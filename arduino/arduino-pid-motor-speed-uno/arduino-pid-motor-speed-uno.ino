// Arduino Uno motor speed PID example
// Motor PWM: pin 3
// Sensor input: pin 2
//
// This version is tuned for cleaner speed measurement:
// - rejects implausibly fast pulses
// - uses pulse-period RPM for better low-speed behavior
// - blends count-based and interval-based estimates
// - applies EMA smoothing for a steadier PID process variable
// - drops to zero when pulses go stale

const byte SENSOR_PIN = 2;
const byte PWM_PIN = 3;
const byte DIR_PIN = 8;
const byte ENABLE_PIN = 7;

volatile unsigned long pulseCount = 0;
volatile unsigned long lastAcceptedPulseMicros = 0;
volatile unsigned long lastPulseIntervalMicros = 0;
volatile bool hasPulseInterval = false;

float targetRPM = 0.0;
float processRPM = 0.0;   // filtered RPM used by PID and UI
float rawRPM = 0.0;       // immediate estimate for debugging
bool manualMode = true;

float kp = 1.4;
float ki = 0.25;
float kd = 0.04;

float integral = 0.0;
float previousError = 0.0;

unsigned long lastLoopMs = 0;
unsigned long lastPulseSnapshot = 0;
const unsigned long LOOP_MS = 100;

float pulsesPerRev = 1.0;                // set this to your real sensor pulse count
const float MAX_VALID_RPM = 6000.0;      // reject clearly bogus pulse bursts
const int PWM_MIN = 0;
const int PWM_MAX = 255;
const unsigned long STALE_MULTIPLIER = 3;
const unsigned long ABSOLUTE_STALE_US = 2000000UL;
const float RPM_FILTER_ALPHA = 0.22;
const float RPM_FILTER_ALPHA_FAST = 0.45;

int pwmOutput = 0;
int manualPWM = 0;

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

unsigned long minPulseIntervalUs() {
  if (pulsesPerRev <= 0.0) return 8000UL;
  float interval = 60000000.0 / (MAX_VALID_RPM * pulsesPerRev);
  if (interval < 2000.0) interval = 2000.0;
  return (unsigned long)interval;
}

float rpmFromInterval(unsigned long intervalUs) {
  if (intervalUs == 0 || pulsesPerRev <= 0.0) return 0.0;
  return 60000000.0 / (intervalUs * pulsesPerRev);
}

float rpmFromCount(unsigned long pulses, unsigned long dtMs) {
  if (dtMs == 0 || pulsesPerRev <= 0.0) return 0.0;
  float revs = pulses / pulsesPerRev;
  float minutes = dtMs / 60000.0;
  return revs / minutes;
}

float ema(float currentValue, float nextValue, float alpha) {
  return currentValue + (alpha * (nextValue - currentValue));
}

void countPulse() {
  unsigned long nowMicros = micros();
  unsigned long minInterval = minPulseIntervalUs();

  if (lastAcceptedPulseMicros != 0) {
    unsigned long interval = nowMicros - lastAcceptedPulseMicros;
    if (interval < minInterval) {
      return;
    }
    lastPulseIntervalMicros = interval;
    hasPulseInterval = true;
  }

  lastAcceptedPulseMicros = nowMicros;
  pulseCount++;
}

void applyMotorOutput(int pwm) {
  analogWrite(PWM_PIN, pwm);
}

void handleSerialTuning() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() < 2) return;

  char key = cmd.charAt(0);
  float value = cmd.substring(1).toFloat();

  if (key == 'T') targetRPM = value;
  if (key == 'P') kp = value;
  if (key == 'I') ki = value;
  if (key == 'D') kd = value;
  if (key == 'R' && value > 0.0) pulsesPerRev = value;
  if (key == 'O') {
    manualPWM = clampInt((int)value, PWM_MIN, PWM_MAX);
    if (manualMode) {
      pwmOutput = manualPWM;
      applyMotorOutput(pwmOutput);
    }
  }
  if (key == 'M') {
    manualMode = ((int)value) != 0;
    if (manualMode) {
      pwmOutput = manualPWM;
      applyMotorOutput(pwmOutput);
    }
  }

  Serial.print("UPDATED -> mode:"); Serial.print(manualMode ? "MANUAL" : "PID");
  Serial.print(" T:"); Serial.print(targetRPM);
  Serial.print(" P:"); Serial.print(kp);
  Serial.print(" I:"); Serial.print(ki);
  Serial.print(" D:"); Serial.print(kd);
  Serial.print(" R:"); Serial.print(pulsesPerRev);
  Serial.print(" O:"); Serial.println(manualPWM);
}

void setup() {
  Serial.begin(115200);

  pinMode(SENSOR_PIN, INPUT_PULLUP);
  pinMode(PWM_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);
  pinMode(ENABLE_PIN, OUTPUT);

  digitalWrite(DIR_PIN, HIGH);
  digitalWrite(ENABLE_PIN, HIGH);
  analogWrite(PWM_PIN, 0);

  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), countPulse, FALLING);

  lastLoopMs = millis();

  Serial.println("UNO motor PID started");
  Serial.println("Pins -> sensor: 2, motor PWM: 3");
  Serial.println("Commands: M1 manual, M0 pid, O120 pwm, T120 target, P1.4, I0.25, D0.04, R1 pulses/rev");
  Serial.println("Starts in MANUAL mode with targetRPM = 0 for safety");
}

void loop() {
  handleSerialTuning();

  unsigned long nowMs = millis();
  unsigned long dtMs = nowMs - lastLoopMs;
  if (dtMs < LOOP_MS) return;

  unsigned long nowMicros = micros();
  unsigned long snapshotPulseCount;
  unsigned long snapshotLastPulseMicros;
  unsigned long snapshotPulseIntervalMicros;
  bool snapshotHasPulseInterval;

  noInterrupts();
  snapshotPulseCount = pulseCount;
  snapshotLastPulseMicros = lastAcceptedPulseMicros;
  snapshotPulseIntervalMicros = lastPulseIntervalMicros;
  snapshotHasPulseInterval = hasPulseInterval;
  interrupts();

  unsigned long pulseDelta = snapshotPulseCount - lastPulseSnapshot;
  lastPulseSnapshot = snapshotPulseCount;

  unsigned long sinceLastPulseUs = (snapshotLastPulseMicros == 0) ? ABSOLUTE_STALE_US + 1 : (nowMicros - snapshotLastPulseMicros);
  bool intervalFresh = snapshotHasPulseInterval && snapshotPulseIntervalMicros > 0;
  if (intervalFresh) {
    unsigned long staleWindow = snapshotPulseIntervalMicros * STALE_MULTIPLIER;
    if (staleWindow > ABSOLUTE_STALE_US) staleWindow = ABSOLUTE_STALE_US;
    intervalFresh = sinceLastPulseUs <= staleWindow;
  }

  float intervalRPM = intervalFresh ? rpmFromInterval(snapshotPulseIntervalMicros) : 0.0;
  float countRPM = rpmFromCount(pulseDelta, dtMs);

  if (pulseDelta >= 2 && intervalFresh) {
    rawRPM = (countRPM * 0.45) + (intervalRPM * 0.55);
  } else if (pulseDelta >= 1 && intervalFresh) {
    rawRPM = intervalRPM;
  } else if (pulseDelta >= 2) {
    rawRPM = countRPM;
  } else if (intervalFresh) {
    rawRPM = intervalRPM;
  } else {
    rawRPM = 0.0;
  }

  float alpha = (rawRPM < processRPM) ? RPM_FILTER_ALPHA_FAST : RPM_FILTER_ALPHA;
  processRPM = ema(processRPM, rawRPM, alpha);

  if (!intervalFresh && rawRPM == 0.0 && processRPM < 3.0) {
    processRPM = 0.0;
  }

  float dtSeconds = dtMs / 1000.0;
  float error = targetRPM - processRPM;

  integral += error * dtSeconds;
  integral = clampFloat(integral, -300.0, 300.0);

  float derivative = 0.0;
  if (dtSeconds > 0.0) {
    derivative = (error - previousError) / dtSeconds;
  }

  if (manualMode) {
    pwmOutput = manualPWM;
    applyMotorOutput(pwmOutput);
  } else {
    float pid = (kp * error) + (ki * integral) + (kd * derivative);
    pid = clampFloat(pid, PWM_MIN, PWM_MAX);
    pwmOutput = (int)pid;
    applyMotorOutput(pwmOutput);
  }

  previousError = error;
  lastLoopMs = nowMs;

  Serial.print("mode="); Serial.print(manualMode ? "MANUAL" : "PID");
  Serial.print(", targetRPM="); Serial.print(targetRPM);
  Serial.print(", processRPM="); Serial.print(processRPM);
  Serial.print(", rawRPM="); Serial.print(rawRPM);
  Serial.print(", error="); Serial.print(error);
  Serial.print(", pwm="); Serial.println(pwmOutput);
}
