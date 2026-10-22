/* Hélice 3D em canvas: projeção em perspectiva feita à mão, sem bibliotecas (funciona offline). */
(function () {
  const canvas = document.getElementById("helixCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("helixStage");
  const el = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("pt-BR");

  const COLOR = { A: "#2fbf8a", T: "#f0883e", C: "#8b6cf0", G: "#3b8bf5", N: "#f4bd4f" };
  const NAME = { A: "adenina", T: "timina", C: "citosina", G: "guanina", N: "base indeterminada" };
  const COMP = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  const STRAND = ["#4fd8cc", "#e9c46a"];
  const RISE = 0.5, TWIST = 0.62, PHASE = 2.5, R = 1.3, CAM = 11, WINDOW = 20;
  const EXEMPLO = "ATGAAACGCATTAGCACCACCATTACCACCAC";

  const st = {
    seq: [], spin: 0, pitch: -0.3, roll: -0.5, zoom: 1,
    auto: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    speed: 1, labels: true, sel: -1, start: 1, visible: true, w: 0, h: 0, dpr: 1
  };
  let hits = [];

  /* ---------- geometria ---------- */
  function helixPoint(t, strand) {            // t = índice fracionário do par de bases
    const th = t * TWIST + st.spin + (strand ? PHASE : 0);
    return [R * Math.cos(th), (t - (st.seq.length - 1) / 2) * RISE, R * Math.sin(th)];
  }
  function view(p) {                          // inclinação fixa (roll) + giro vertical do usuário (pitch)
    const cr = Math.cos(st.roll), sr = Math.sin(st.roll), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const x1 = p[0] * cr - p[1] * sr, y1 = p[0] * sr + p[1] * cr;
    return [x1, y1 * cp - p[2] * sp, y1 * sp + p[2] * cp];
  }
  function project(p) {
    const v = view(p), s = CAM / (CAM - v[2]);
    const unit = st.unit * st.zoom;
    return { x: st.w / 2 + v[0] * s * unit, y: st.h / 2 - v[1] * s * unit, z: v[2], s, u: unit * s };
  }
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const fog = (z) => Math.max(0.3, Math.min(1, 0.55 + z * 0.2));

  /* ---------- desenho ---------- */
  function draw() {
    const n = st.seq.length;
    ctx.clearRect(0, 0, st.w, st.h);
    if (!n) return;
    const asp = st.w / st.h;
    st.roll = -(0.25 + Math.max(0, Math.min(1, (asp - 0.8) / 1.0)) * 1.1);
    const H = (n * RISE) / 2, ex = H * Math.abs(Math.sin(st.roll)) + R * 1.25, ey = H * Math.abs(Math.cos(st.roll)) + R * 1.25;
    st.unit = 0.97 * Math.min(st.w / 2 / ex, (st.h - 26) / 2 / ey);
    const prims = []; hits = [];
    const add = (z, fn) => prims.push({ z, fn });

    for (let i = 0; i < n; i++) {
      const b1 = st.seq[i].base, b2 = COMP[b1];
      const p1 = helixPoint(i, 0), p2 = helixPoint(i, 1);
      const a = project(p1), b = project(p2);
      const m = project(lerp3(p1, p2, 0.5));
      const c1 = project(lerp3(p1, p2, 0.3)), c2 = project(lerp3(p1, p2, 0.7));
      const g1 = project(lerp3(p1, p2, 0.42)), g2 = project(lerp3(p1, p2, 0.58));
      const nb = b1 === "C" || b1 === "G" ? 3 : 2;
      const sel = i === st.sel;

      // metade de cada base (haste colorida) + marcador circular com a letra
      [[a, m, c1, b1, 0], [b, m, c2, b2, 1]].forEach(([from, to, c, base, side]) => {
        add((from.z + to.z) / 2, () => {
          ctx.globalAlpha = fog((from.z + to.z) / 2);
          ctx.strokeStyle = COLOR[base]; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, 0.09 * from.u);
          ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        });
        add(c.z + 0.01, () => {
          const r = Math.max(5, 0.2 * c.u);
          ctx.globalAlpha = fog(c.z);
          ctx.fillStyle = COLOR[base]; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 6.2832); ctx.fill();
          ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeStyle = sel ? "#fff" : "rgba(255,255,255,.45)"; ctx.stroke();
          if (st.labels && r > 5.5) {
            ctx.fillStyle = "#06151c"; ctx.font = `800 ${Math.round(r * 1.2)}px Consolas, monospace`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(base, c.x, c.y + 0.5);
          }
        });
        hits.push({ i, x: c.x, y: c.y, r: Math.max(5, 0.2 * c.u), z: c.z });
      });

      // ligações de hidrogênio (2 em A–T, 3 em C–G)
      add(m.z + 0.02, () => {
        const dx = g2.x - g1.x, dy = g2.y - g1.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        ctx.globalAlpha = fog(m.z) * (sel ? 1 : 0.85);
        ctx.strokeStyle = "#e8f6f6"; ctx.lineWidth = Math.max(1, 0.035 * m.u); ctx.lineCap = "butt";
        for (let k = 0; k < nb; k++) {
          const o = (k - (nb - 1) / 2) * 0.1 * m.u;
          ctx.beginPath(); ctx.moveTo(g1.x + nx * o, g1.y + ny * o); ctx.lineTo(g2.x + nx * o, g2.y + ny * o); ctx.stroke();
        }
      });
    }

    // esqueleto açúcar-fosfato: 3 subsegmentos por par para curvar suavemente
    for (let s = 0; s < 2; s++) {
      for (let t = 0; t < n - 1; t += 1 / 3) {
        const q0 = project(helixPoint(t, s)), q1 = project(helixPoint(Math.min(n - 1, t + 1 / 3), s));
        add((q0.z + q1.z) / 2 - 0.02, () => {
          ctx.globalAlpha = fog((q0.z + q1.z) / 2); ctx.strokeStyle = STRAND[s]; ctx.lineCap = "round";
          ctx.lineWidth = Math.max(3, 0.15 * q0.u);
          ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
        });
      }
    }

    prims.sort((p, q) => p.z - q.z).forEach((p) => { ctx.save(); p.fn(); ctx.restore(); });

    // extremidades 5′ / 3′
    ctx.save(); ctx.font = "700 12px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    [[0, 0, "5′"], [n - 1, 0, "3′"], [0, 1, "3′"], [n - 1, 1, "5′"]].forEach(([i, s, txt]) => {
      const q = project(helixPoint(i, s)), up = i === 0 ? 1 : -1;
      ctx.fillStyle = STRAND[s]; ctx.globalAlpha = 0.95; ctx.fillText(txt, q.x, q.y + up * 18);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- painel de informações ---------- */
  function info() {
    const box = el("helixInfo"), n = st.seq.length;
    if (!n) return;
    const gc = st.seq.filter((x) => x.base === "G" || x.base === "C").length / n * 100;
    if (st.sel < 0 || !st.seq[st.sel]) {
      box.innerHTML = `<b>Toque numa base</b><span class="muted">Veja quem pareia com quem e quantas ligações de hidrogênio existem. GC deste trecho: ${gc.toFixed(0)}%.</span>`;
      return;
    }
    const x = st.seq[st.sel], c = COMP[x.base], nb = x.base === "C" || x.base === "G" ? 3 : 2;
    const chip = (b) => `<i style="background:${COLOR[b]}">${b}</i>`;
    box.innerHTML = `<b>Par ${st.sel + 1} de ${n}${x.pos ? " · posição " + fmt(x.pos) : ""}</b>
      <div class="pair">${chip(x.base)} ${NAME[x.base]} ↔ ${chip(c)} ${NAME[c]}</div>
      <span class="muted">${nb} ligações de hidrogênio${nb === 3 ? ": pares C–G são mais estáveis, por isso regiões ricas em GC derretem em temperaturas mais altas." : "."}</span>`;
  }

  /* ---------- dados ---------- */
  function setSeq(seq, label) {
    st.seq = seq; st.sel = -1;
    el("helixSource").textContent = label;
    info();
  }
  function useExample() {
    setSeq([...EXEMPLO.slice(0, WINDOW)].map((b) => ({ base: b, pos: null })), "Sequência de exemplo (não é do genoma)");
  }
  async function loadReal(start) {
    start = Math.max(1, parseInt(start, 10) || 1);
    const d = await getJSON(`/api/sequence?start=${start}&limit=${WINDOW}`);
    st.start = d.start; el("helixStart").value = d.start;
    setSeq(d.rows.map((r) => ({ base: r.base, pos: r.position })), `Genoma real: posições ${fmt(d.start)} a ${fmt(d.end)}`);
  }
  const safeLoad = (s) => loadReal(s).catch((e) => { el("helixSource").textContent = e.message; });
  el("helixLoadBtn").addEventListener("click", () => safeLoad(el("helixStart").value));
  el("helixNextBtn").addEventListener("click", () => safeLoad(st.start + WINDOW));
  el("helixPrevBtn").addEventListener("click", () => safeLoad(st.start - WINDOW));
  el("helixStart").addEventListener("keydown", (e) => { if (e.key === "Enter") safeLoad(el("helixStart").value); });
  el("helixExampleBtn").addEventListener("click", useExample);

  /* ---------- controles ---------- */
  const playBtn = el("helixPlayBtn");
  const syncPlay = () => { playBtn.textContent = st.auto ? "❚❚ Pausar" : "▶ Girar"; };
  playBtn.addEventListener("click", () => { st.auto = !st.auto; syncPlay(); });
  el("helixResetBtn").addEventListener("click", () => { st.pitch = -0.3; st.zoom = 1; st.sel = -1; info(); });
  el("helixSpeed").addEventListener("input", (e) => { st.speed = parseFloat(e.target.value); });
  el("helixLabels").addEventListener("change", (e) => { st.labels = e.target.checked; });
  syncPlay();

  /* ---------- ponteiro: arrastar, pinça, toque ---------- */
  const ptrs = new Map(); let moved = 0, last = null, pinch = 0;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function pick(p, touch) {
    let best = null;
    hits.forEach((h) => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d <= h.r + (touch ? 18 : 8) && (!best || h.z > best.z)) best = h; });
    const s = best ? best.i : -1;
    if (s !== st.sel) { st.sel = s; info(); }
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, pos(e));
    if (ptrs.size === 1) { moved = 0; last = pos(e); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pos(e);
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === "mouse") pick(p); return; }
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) st.zoom = Math.max(0.5, Math.min(2.8, st.zoom * d / pinch));
      pinch = d; return;
    }
    const dx = p.x - last.x, dy = p.y - last.y; moved += Math.abs(dx) + Math.abs(dy); last = p;
    if (moved > 6) { st.spin += dx * 0.012; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.008)); }
  });
  const end = (e) => {
    if (ptrs.size === 1 && moved <= 6) pick(pos(e), e.pointerType !== "mouse");
    ptrs.delete(e.pointerId); pinch = 0;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); st.zoom = Math.max(0.5, Math.min(2.8, st.zoom * Math.exp(-e.deltaY * 0.0015)));
  }, { passive: false });

  /* ---------- tamanho e laço de animação ---------- */
  function resize() {
    const r = stage.getBoundingClientRect();
    st.dpr = window.devicePixelRatio || 1; st.w = r.width; st.h = r.height;
    canvas.width = Math.round(r.width * st.dpr); canvas.height = Math.round(r.height * st.dpr);
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver((en) => { st.visible = en[0].isIntersecting; }).observe(stage);
  resize();

  let t0 = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - t0) / 1000); t0 = t;
    if (st.visible && st.w) {
      if (st.auto && !ptrs.size) st.spin += dt * 0.7 * st.speed;
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  useExample();
  safeLoad(1);
})();
