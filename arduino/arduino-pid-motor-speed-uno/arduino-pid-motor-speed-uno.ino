// Arduino Uno motor speed PID example
// Generic starting point for a DC motor + hall sensor/encoder + PWM motor driver.
// If your hardware is different, this still gives you a real base to modify.

const byte SENSOR_PIN = 2;   // interrupt pin on Uno
const byte PWM_PIN = 3;      // PWM output to motor driver
const byte DIR_PIN = 8;      // optional direction pin
const byte ENABLE_PIN = 7;   // optional enable pin

volatile unsigned long pulseCount = 0;
volatile unsigned long lastPulseMicros = 0;

float targetRPM = 0.0;
float currentRPM = 0.0;
bool manualMode = true;

float kp = 1.4;
float ki = 0.25;
float kd = 0.04;

float integral = 0.0;
float previousError = 0.0;

unsigned long lastLoopMs = 0;
unsigned long lastPulseSnapshot = 0;
const unsigned long LOOP_MS = 100;

const float PULSES_PER_REV = 1.0; // change this for your sensor
const int PWM_MIN = 0;
const int PWM_MAX = 255;
const unsigned long MIN_PULSE_INTERVAL_US = 2000; // crude noise filter, adjust for your sensor

int pwmOutput = 0;
int manualPWM = 0;

void countPulse() {
  unsigned long nowMicros = micros();
  if (nowMicros - lastPulseMicros >= MIN_PULSE_INTERVAL_US) {
    pulseCount++;
    lastPulseMicros = nowMicros;
  }
}

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

float calculateRPM(unsigned long pulses, unsigned long dtMs) {
  if (dtMs == 0) return 0.0;
  float revs = pulses / PULSES_PER_REV;
  float minutes = dtMs / 60000.0;
  return revs / minutes;
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
  Serial.println("Commands: M1 manual, M0 pid, O120 pwm, T120 target, P1.4, I0.25, D0.04");
  Serial.println("Starts in MANUAL mode with targetRPM = 0 for safety");
}

void loop() {
  handleSerialTuning();

  unsigned long now = millis();
  unsigned long dtMs = now - lastLoopMs;
  if (dtMs < LOOP_MS) return;

  noInterrupts();
  unsigned long snapshot = pulseCount;
  interrupts();

  unsigned long pulseDelta = snapshot - lastPulseSnapshot;
  lastPulseSnapshot = snapshot;

  currentRPM = calculateRPM(pulseDelta, dtMs);

  float dtSeconds = dtMs / 1000.0;
  float error = targetRPM - currentRPM;

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
  lastLoopMs = now;

  Serial.print("mode="); Serial.print(manualMode ? "MANUAL" : "PID");
  Serial.print(", targetRPM="); Serial.print(targetRPM);
  Serial.print(", currentRPM="); Serial.print(currentRPM);
  Serial.print(", error="); Serial.print(error);
  Serial.print(", pwm="); Serial.println(pwmOutput);
}
