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
  rawRpm: document.getElementById('rawRpm'),
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
  const height = Math.max(220, Math.floor(rect.height || canvas.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  graph.setTransform(1, 0, 0, 1, 0, 0);
  graph.scale(dpr, dpr);

  graph.clearRect(0, 0, width, height);

  const pad = { top: 16, right: 14, bottom: 18, left: 14 };
  const gap = 16;
  const innerW = width - pad.left - pad.right;
  const bandH = (height - pad.top - pad.bottom - gap) / 2;
  const pwmArea = { top: pad.top, bottom: pad.top + bandH, left: pad.left, right: width - pad.right };
  const pvArea = { top: pad.top + bandH + gap, bottom: height - pad.bottom, left: pad.left, right: width - pad.right };

  const drawBand = (area, label, color, maxLabel) => {
    const h = area.bottom - area.top;
    graph.fillStyle = 'rgba(255,255,255,0.025)';
    graph.fillRect(area.left, area.top, innerW, h);

    graph.strokeStyle = 'rgba(255,255,255,0.08)';
    graph.lineWidth = 1;
    for (let i = 0; i <= 3; i += 1) {
      const y = area.top + (h / 3) * i;
      graph.beginPath();
      graph.moveTo(area.left, y);
      graph.lineTo(area.right, y);
      graph.stroke();
    }

    graph.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    graph.fillStyle = color;
    graph.fillText(label, area.left + 8, area.top + 13);
    graph.fillStyle = 'rgba(152,163,190,0.95)';
    graph.fillText(String(maxLabel), area.right - 40, area.top + 13);
    graph.fillText('0', area.right - 12, area.bottom - 6);
  };

  if (!history.length) {
    drawBand(pwmArea, 'PWM', '#7ae0b4', 255);
    drawBand(pvArea, 'PID / RPM', '#ff9f43', 1000);
    return;
  }

  const points = history.slice(-MAX_HISTORY);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const maxPv = Math.max(1000, ...points.map((point) => point.pv || 0));

  drawBand(pwmArea, 'PWM', '#7ae0b4', 255);
  drawBand(pvArea, 'PID / RPM', '#ff9f43', Math.round(maxPv));

  const yForArea = (area, value, maxValue) => {
    const h = area.bottom - area.top;
    return area.top + h - (Math.min(value, maxValue) / maxValue) * h;
  };

  const drawSeries = ({ area, values, maxValue, strokeStyle, lineWidth, fillStyle, pointRadius, optimisticColor }) => {
    if (!values.length) return;

    if (fillStyle) {
      graph.beginPath();
      values.forEach((value, index) => {
        const x = area.left + stepX * index;
        const y = yForArea(area, value, maxValue);
        if (index === 0) graph.moveTo(x, y);
        else graph.lineTo(x, y);
      });
      graph.lineTo(area.left + stepX * (values.length - 1), area.bottom);
      graph.lineTo(area.left, area.bottom);
      graph.closePath();
      graph.fillStyle = fillStyle;
      graph.fill();
    }

    graph.beginPath();
    values.forEach((value, index) => {
      const x = area.left + stepX * index;
      const y = yForArea(area, value, maxValue);
      if (index === 0) graph.moveTo(x, y);
      else graph.lineTo(x, y);
    });
    graph.strokeStyle = strokeStyle;
    graph.lineWidth = lineWidth;
    graph.stroke();

    const lastIndex = values.length - 1;
    const lastX = area.left + stepX * lastIndex;
    const lastY = yForArea(area, values[lastIndex], maxValue);
    graph.beginPath();
    graph.arc(lastX, lastY, pointRadius, 0, Math.PI * 2);
    graph.fillStyle = optimisticColor || strokeStyle;
    graph.fill();
    graph.strokeStyle = 'rgba(10,13,22,0.9)';
    graph.lineWidth = 2;
    graph.stroke();
  };

  const pwmGradient = graph.createLinearGradient(0, pwmArea.top, 0, pwmArea.bottom);
  pwmGradient.addColorStop(0, 'rgba(122,224,180,0.32)');
  pwmGradient.addColorStop(1, 'rgba(122,224,180,0.03)');

  drawSeries({
    area: pwmArea,
    values: points.map((point) => point.pwm),
    maxValue: 255,
    strokeStyle: '#7ae0b4',
    lineWidth: 2.5,
    fillStyle: pwmGradient,
    pointRadius: 5,
    optimisticColor: points[points.length - 1].optimistic ? '#ffd166' : '#7ae0b4',
  });

  drawSeries({
    area: pvArea,
    values: points.map((point) => point.pv),
    maxValue: maxPv,
    strokeStyle: '#ff9f43',
    lineWidth: 2,
    fillStyle: null,
    pointRadius: 4,
  });
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
  els.rawRpm.textContent = Number(state.rawRPM || 0).toFixed(0);
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
