const els = {
  connectionBadge: document.getElementById('connectionBadge'),
  modeBadge: document.getElementById('modeBadge'),
  pwmValue: document.getElementById('pwmValue'),
  pwmSlider: document.getElementById('pwmSlider'),
  manualInput: document.getElementById('manualInput'),
  sendManual: document.getElementById('sendManual'),
  stopButton: document.getElementById('stopButton'),
  targetRpm: document.getElementById('targetRpm'),
  currentRpm: document.getElementById('currentRpm'),
  errorValue: document.getElementById('errorValue'),
  lastCommand: document.getElementById('lastCommand'),
  logView: document.getElementById('logView'),
  manualModeButton: document.getElementById('manualModeButton'),
  pidModeButton: document.getElementById('pidModeButton'),
  rpmInput: document.getElementById('rpmInput'),
  sendRpm: document.getElementById('sendRpm'),
};

async function post(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function render(state) {
  els.connectionBadge.textContent = state.connected ? 'Connected' : 'Disconnected';
  els.connectionBadge.classList.toggle('badge-live', !!state.connected);
  els.modeBadge.textContent = `Mode: ${state.mode}`;
  els.pwmValue.textContent = state.pwm;
  els.pwmSlider.value = state.pwm;
  els.manualInput.value = state.pwm;
  els.targetRpm.textContent = Number(state.targetRPM || 0).toFixed(0);
  els.currentRpm.textContent = Number(state.currentRPM || 0).toFixed(0);
  els.errorValue.textContent = Number(state.error || 0).toFixed(0);
  els.lastCommand.textContent = state.lastCommand || '—';
  els.logView.textContent = (state.log || []).slice(-24).join('\n') || 'Waiting for data…';
  const manual = String(state.mode || '').toUpperCase() === 'MANUAL';
  els.manualModeButton.classList.toggle('active', manual);
  els.pidModeButton.classList.toggle('active', !manual);
}

async function refresh() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const state = await res.json();
    render(state);
  } catch (err) {
    els.connectionBadge.textContent = 'UI disconnected';
  }
}

function bind() {
  document.querySelectorAll('.preset').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = Number(button.dataset.pwm || 0);
      await post('/api/pwm', { value });
      refresh();
    });
  });

  let sliderTimer;
  els.pwmSlider.addEventListener('input', () => {
    els.pwmValue.textContent = els.pwmSlider.value;
    els.manualInput.value = els.pwmSlider.value;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(async () => {
      await post('/api/pwm', { value: Number(els.pwmSlider.value) });
      refresh();
    }, 120);
  });

  els.sendManual.addEventListener('click', async () => {
    await post('/api/pwm', { value: Number(els.manualInput.value || 0) });
    refresh();
  });

  els.stopButton.addEventListener('click', async () => {
    await post('/api/stop');
    refresh();
  });

  els.manualModeButton.addEventListener('click', async () => {
    await post('/api/mode', { manual: true });
    refresh();
  });

  els.pidModeButton.addEventListener('click', async () => {
    await post('/api/mode', { manual: false });
    refresh();
  });

  els.sendRpm.addEventListener('click', async () => {
    await post('/api/rpm', { value: Number(els.rpmInput.value || 0) });
    refresh();
  });
}

bind();
refresh();
setInterval(refresh, 1200);
