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
  pwmGraph: document.getElementById('pwmGraph'),
};

const history = [];
const MAX_HISTORY = 90;
const graph = els.pwmGraph.getContext('2d');

function pushHistory({ pwm, pv, optimistic = false }) {
  const next = {
    pwm: Math.max(0, Math.min(255, Number(pwm) || 0)),
    pv: Math.max(0, Number(pv) || 0),
    t: Date.now(),
    optimistic,
  };
  const last = history[history.length - 1];
  if (last && Math.abs(last.pwm - next.pwm) < 0.5 && Math.abs(last.pv - next.pv) < 0.5 && next.t - last.t < 250 && last.optimistic === optimistic) {
    return;
  }
  history.push(next);
  while (history.length > MAX_HISTORY) history.shift();
  drawGraph();
}

function drawGraph() {
  const canvas = els.pwmGraph;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.width));
  const height = Math.max(180, Math.floor(rect.height || canvas.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  graph.setTransform(1, 0, 0, 1, 0, 0);
  graph.scale(dpr, dpr);

  graph.clearRect(0, 0, width, height);

  const pad = { top: 14, right: 12, bottom: 22, left: 12 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  graph.strokeStyle = 'rgba(255,255,255,0.08)';
  graph.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (innerH / 4) * i;
    graph.beginPath();
    graph.moveTo(pad.left, y);
    graph.lineTo(width - pad.right, y);
    graph.stroke();
  }

  graph.fillStyle = 'rgba(152,163,190,0.9)';
  graph.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  graph.fillText('255', pad.left, pad.top - 2);
  graph.fillText('0', pad.left, height - 6);

  if (!history.length) return;

  const points = history.slice(-MAX_HISTORY);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const maxPv = Math.max(1000, ...points.map((point) => point.pv || 0));
  const yForPwm = (value) => pad.top + innerH - (value / 255) * innerH;
  const yForPv = (value) => pad.top + innerH - (Math.min(value, maxPv) / maxPv) * innerH;

  graph.fillStyle = 'rgba(255,159,67,0.9)';
  graph.fillText(String(Math.round(maxPv)), width - pad.right - 42, pad.top - 2);
  graph.fillText('0', width - pad.right - 10, height - 6);

  const pwmGradient = graph.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  pwmGradient.addColorStop(0, 'rgba(122,224,180,0.32)');
  pwmGradient.addColorStop(1, 'rgba(122,224,180,0.02)');

  graph.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + stepX * index;
    const y = yForPwm(point.pwm);
    if (index === 0) graph.moveTo(x, y);
    else graph.lineTo(x, y);
  });
  graph.lineTo(pad.left + stepX * (points.length - 1), height - pad.bottom);
  graph.lineTo(pad.left, height - pad.bottom);
  graph.closePath();
  graph.fillStyle = pwmGradient;
  graph.fill();

  graph.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + stepX * index;
    const y = yForPwm(point.pwm);
    if (index === 0) graph.moveTo(x, y);
    else graph.lineTo(x, y);
  });
  graph.strokeStyle = '#7ae0b4';
  graph.lineWidth = 2.5;
  graph.stroke();

  graph.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + stepX * index;
    const y = yForPv(point.pv);
    if (index === 0) graph.moveTo(x, y);
    else graph.lineTo(x, y);
  });
  graph.strokeStyle = '#ff9f43';
  graph.lineWidth = 2;
  graph.stroke();

  const last = points[points.length - 1];
  const lastX = pad.left + stepX * (points.length - 1);
  const lastPwmY = yForPwm(last.pwm);
  const lastPvY = yForPv(last.pv);

  graph.beginPath();
  graph.arc(lastX, lastPwmY, 5, 0, Math.PI * 2);
  graph.fillStyle = last.optimistic ? '#ffd166' : '#7ae0b4';
  graph.fill();
  graph.strokeStyle = 'rgba(10,13,22,0.9)';
  graph.lineWidth = 2;
  graph.stroke();

  graph.beginPath();
  graph.arc(lastX, lastPvY, 4, 0, Math.PI * 2);
  graph.fillStyle = '#ff9f43';
  graph.fill();
  graph.strokeStyle = 'rgba(10,13,22,0.9)';
  graph.lineWidth = 2;
  graph.stroke();
}

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
  pushHistory({ pwm: state.pwm, pv: state.currentRPM, optimistic: false });
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
    const value = Number(els.pwmSlider.value);
    els.pwmValue.textContent = value;
    els.manualInput.value = value;
    const last = history[history.length - 1];
    pushHistory({ pwm: value, pv: last ? last.pv : 0, optimistic: true });
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(async () => {
      await post('/api/pwm', { value });
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

window.addEventListener('resize', drawGraph);

bind();
drawGraph();
refresh();
setInterval(refresh, 1200);
