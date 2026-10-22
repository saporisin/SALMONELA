(function () {
  const fmt = (n) => Number(n).toLocaleString("pt-BR");
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function jumpTo(pos) {
    $("startInput").value = Math.max(1, pos - 10);
    $("showBtn").click();
    $("sequencia").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Menu lateral: destaca a seção visível */
  const links = [...document.querySelectorAll('.sidebar a[href^="#"]')];
  const byId = Object.fromEntries(links.map(a => [a.getAttribute("href").slice(1), a]));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && byId[e.target.id]) {
        links.forEach(a => a.classList.remove("active"));
        byId[e.target.id].classList.add("active");
      }
    });
  }, { rootMargin: "-25% 0px -65% 0px" });
  Object.keys(byId).forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });

  /* Gráfico de conteúdo GC */
  async function drawGC() {
    const box = $("gcChart");
    try {
      const d = await getJSON("/api/gc?windows=240");
      const v = d.values, W = 800, H = 230, L = 38, R = 10, T = 12, B = 26;
      const lo = Math.floor(Math.min(...v) - 1), hi = Math.ceil(Math.max(...v) + 1);
      const x = i => L + (i / (v.length - 1)) * (W - L - R);
      const y = g => T + (1 - (g - lo) / (hi - lo)) * (H - T - B);
      const line = v.map((g, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(g).toFixed(1)).join(" ");
      const area = line + ` L${x(v.length - 1)} ${H - B} L${L} ${H - B} Z`;
      let grid = "";
      for (let g = lo; g <= hi; g += Math.max(1, Math.round((hi - lo) / 4))) {
        grid += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#1a3846"/><text class="ax" x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${g}%</text>`;
      }
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" id="gcSvg">${grid}
        <path d="${area}" fill="rgba(59,139,245,.18)"/><path d="${line}" fill="none" stroke="#3b8bf5" stroke-width="1.8"/>
        <line x1="${L}" x2="${W - R}" y1="${y(d.mean)}" y2="${y(d.mean)}" stroke="#2fd0c0" stroke-dasharray="5 4"/>
        <text class="ax" x="${W - R}" y="${y(d.mean) - 5}" text-anchor="end" fill="#2fd0c0">média ${d.mean.toFixed(1)}%</text>
        <line id="gcMark" y1="${T}" y2="${H - B}" stroke="#f0883e" stroke-width="1.5" visibility="hidden"/>
        <text class="ax" x="${L}" y="${H - 6}">1</text><text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(d.length)} pb</text></svg>`;
      const svg = $("gcSvg"), mark = $("gcMark"), info = $("gcChartInfo");
      let sel = 0;
      const pick = ev => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * W;
        sel = Math.min(v.length - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (v.length - 1))));
        mark.setAttribute("x1", x(sel)); mark.setAttribute("x2", x(sel)); mark.setAttribute("visibility", "visible");
        info.textContent = `${fmt(sel * d.window + 1)}–${fmt(Math.min(d.length, (sel + 1) * d.window))} · GC ${v[sel].toFixed(2)}% (toque de novo para abrir)`;
      };
      svg.addEventListener("pointermove", pick);
      svg.addEventListener("pointerdown", pick);
      svg.addEventListener("click", () => { if (mark.getAttribute("visibility") === "visible") jumpTo(sel * d.window + 1); });
    } catch (e) {
      box.innerHTML = `<div class="error">${esc(e.message)}</div>`;
    }
  }

  /* Busca de motivo nas duas fitas */
  async function searchMotif() {
    const out = $("motifResult");
    const q = $("motifInput").value.trim();
    out.textContent = "Buscando...";
    try {
      const d = await getJSON("/api/search?q=" + encodeURIComponent(q));
      const block = (nome, r) => {
        if (!r.count) return `<p><span class="strand-tag">${nome}</span>nenhuma ocorrência</p>`;
        const more = r.count > r.positions.length ? ` (mostrando as ${r.positions.length} primeiras)` : "";
        return `<p><span class="strand-tag">${nome}</span><b>${fmt(r.count)}</b> ocorrência(s)${more}</p>
          <div class="hits">${r.positions.map(p => `<button type="button" class="secondary" data-pos="${p}">${fmt(p)}</button>`).join("")}</div>`;
      };
      out.innerHTML = `<p>Motivo <code>${esc(d.query)}</code> · complemento reverso <code>${esc(d.reverse_complement)}</code>${d.palindrome ? " (palíndromo)" : ""}</p>`
        + block("Fita +", d.plus) + (d.palindrome ? "" : block("Fita −", d.minus));
      out.querySelectorAll("[data-pos]").forEach(b => b.addEventListener("click", () => jumpTo(Number(b.dataset.pos))));
    } catch (e) {
      out.innerHTML = `<div class="error">${esc(e.message)}</div>`;
    }
  }
  $("motifBtn").addEventListener("click", searchMotif);
  $("motifInput").addEventListener("keydown", e => { if (e.key === "Enter") searchMotif(); });

  /* Complemento reverso */
  const COMP = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  function revComp() {
    const out = $("rcOutput");
    const s = $("rcInput").value.toUpperCase().replace(/\s+/g, "");
    if (!s) { out.innerHTML = '<div class="error">Digite uma sequência de DNA.</div>'; return; }
    if (/[^ATCGN]/.test(s)) { out.innerHTML = '<div class="error">Use apenas A, T, C, G e N.</div>'; return; }
    const rc = [...s].reverse().map(b => COMP[b]).join("");
    out.innerHTML = `<code>5′-${esc(rc)}-3′</code><div style="margin-top:8px"><button type="button" class="secondary" id="rcCopy">Copiar</button></div>`;
    $("rcCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(rc); $("rcCopy").textContent = "Copiado"; } catch (_) { $("rcCopy").textContent = "Não foi possível copiar"; }
    });
  }
  $("rcBtn").addEventListener("click", revComp);
  $("rcInput").addEventListener("keydown", e => { if (e.key === "Enter") revComp(); });

  drawGC();
})();
