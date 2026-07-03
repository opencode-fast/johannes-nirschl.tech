// Chart.js wrappers. Chart is loaded as a UMD global (see index.html).
const Chart = window.Chart;

Chart.defaults.color = "#7d90a3";
Chart.defaults.borderColor = "#1c2836";
Chart.defaults.font.size = 10;
Chart.defaults.animation = false;

const base = (opts = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0.25 } },
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
    y: { grid: { color: "#16202b" } },
  },
  ...opts,
});

function line(canvasId, datasets, opts) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: { labels: [], datasets },
    options: base(opts),
  });
}

export function createCharts() {
  const ds = (color, label, fill = false) => ({
    label, data: [], borderColor: color,
    backgroundColor: fill ? color + "33" : color, fill,
  });

  return {
    pulse: line("pulseChart", [ds("#ff4d6d", "pulse", true)], {
      scales: { x: { title: { display: true, text: "seconds" }, grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { display: false } },
    }),
    spectrum: new Chart(document.getElementById("spectrumChart"), {
      type: "line",
      data: { labels: [], datasets: [ds("#35c4b5", "power", true)] },
      options: base({
        scales: {
          x: { title: { display: true, text: "BPM" }, grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { display: false },
        },
      }),
    }),
    rgb: line("rgbChart", [ds("#ff6b6b", "R"), ds("#45d67a", "G"), ds("#4d9bff", "B")], {
      plugins: { legend: { display: true, labels: { boxWidth: 10 } } },
    }),
    pose: line("poseChart", [ds("#e0a83a", "yaw"), ds("#c46be0", "pitch"), ds("#4d9bff", "roll")], {
      plugins: { legend: { display: true, labels: { boxWidth: 10 } } },
    }),
    light: line("lightChart", [ds("#e0e0a8", "brightness", true)], {}),
    motion: line("motionChart", [ds("#e0533a", "motion"), ds("#35c46a", "quality")], {
      plugins: { legend: { display: true, labels: { boxWidth: 10 } } },
    }),
  };
}

function setLine(chart, labels, ...series) {
  chart.data.labels = labels;
  series.forEach((s, i) => { chart.data.datasets[i].data = s; });
  chart.update("none");
}

// data: { time[], pulseTime[], pulse[], specBpm[], specPower[], peakBpm,
//         rgbR[], rgbG[], rgbB[], yaw[], pitch[], roll[], bright[], motion[], quality[] }
export function updateCharts(c, d) {
  const t = d.time.map((x) => x.toFixed(0));

  setLine(c.pulse, d.pulseTime.map((x) => x.toFixed(1)), Array.from(d.pulse));

  // annotate the spectrum peak by coloring the peak marker via pointRadius
  c.spectrum.data.labels = d.specBpm.map((x) => x.toFixed(0));
  c.spectrum.data.datasets[0].data = Array.from(d.specPower);
  c.spectrum.update("none");

  setLine(c.rgb, t, d.rgbR, d.rgbG, d.rgbB);
  setLine(c.pose, t, d.yaw, d.pitch, d.roll);
  setLine(c.light, t, d.bright);
  setLine(c.motion, t, d.motion, d.quality);
}
