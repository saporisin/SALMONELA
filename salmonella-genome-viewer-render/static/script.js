
const $ = (id) => document.getElementById(id);

let totalBases = 0;
let currentStart = 1;
let currentRows = [];

const colors = {
  A: "base-a",
  T: "base-t",
  C: "base-c",
  G: "base-g",
  N: "base-n"
};

function formatNumber(n) {
  return Number(n).toLocaleString("pt-BR");
}

async function getJSON(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível completar a solicitação.");
  }

  return data;
}

async function loadStatus() {
  $("statusMessage").textContent = "Carregando o genoma de referência do NCBI...";
  $("loadBtn").disabled = true;

  try {
    const data = await getJSON("/api/status");

    totalBases = data.length;
    $("sequenceTotal").textContent = formatNumber(totalBases) + " bases";
    $("startInput").max = totalBases;
    $("statusMessage").textContent =
      `Genoma carregado: ${formatNumber(totalBases)} bases · ${data.reference}`;

    await Promise.all([loadStats(), loadSequence(1)]);
  } catch (error) {
    $("statusMessage").textContent =
      "Não foi possível carregar o genoma: " + error.message +
      ". Confira a internet e tente novamente.";

    $("ladder").innerHTML =
      `<div class="loading">${escapeHTML(error.message)}</div>`;
  } finally {
    $("loadBtn").disabled = false;
  }
}

async function loadStats() {
  const data = await getJSON("/api/stats");

  const labels = {
    A: "Adenina",
    T: "Timina",
    C: "Citosina",
    G: "Guanina",
    N: "Indeterminadas"
  };

  $("stats").innerHTML = "ATGCN".split("").map(base => `
    <div class="stat-row">
      <span class="stat-dot ${colors[base]}"></span>
      <span>${labels[base]} <small>(${base}) · ${data.percentages[base].toFixed(3)}%</small></span>
      <b>${formatNumber(data.counts[base])}</b>
    </div>
  `).join("");

  $("gcValue").textContent = data.gc.toFixed(3) + "%";
  $("gcBar").style.width = Math.min(100, data.gc) + "%";
}

async function loadSequence(start) {
  if (!totalBases) return;

  const limit = Number($("limitSelect").value);
  start = Math.min(totalBases, Math.max(1, Number(start) || 1));

  currentStart = start;
  $("startInput").value = start;
  $("ladder").innerHTML = '<div class="loading">Carregando trecho...</div>';

  try {
    const data = await getJSON(
      `/api/sequence?start=${start}&limit=${limit}`
    );

    currentRows = data.rows;

    $("ladder").innerHTML = data.rows.map(row => `
      <div class="ladder-row">
        <span class="pos">${formatNumber(row.position)}</span>
        <span class="nucleotide ${colors[row.base]}">${row.base}</span>
        <span class="pair-dash">—</span>
        <span class="nucleotide ${colors[row.complement]}">${row.complement}</span>
      </div>
    `).join("");

    $("rangeText").textContent =
      `Exibindo posições ${formatNumber(data.start)} a ${formatNumber(data.end)} de ${formatNumber(data.total)}`;

    $("prevBtn").disabled = start <= 1;
    $("nextBtn").disabled = data.end >= totalBases;
  } catch (error) {
    $("ladder").innerHTML =
      `<div class="loading">${escapeHTML(error.message)}</div>`;
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

// Navegação pelo genoma
$("loadBtn").addEventListener("click", loadStatus);

$("showBtn").addEventListener("click", () => {
  loadSequence($("startInput").value);
});

$("prevBtn").addEventListener("click", () => {
  loadSequence(
    Math.max(1, currentStart - Number($("limitSelect").value))
  );
});

$("nextBtn").addEventListener("click", () => {
  loadSequence(
    currentStart + Number($("limitSelect").value)
  );
});

$("limitSelect").addEventListener("change", () => {
  loadSequence(currentStart);
});

$("startInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    loadSequence($("startInput").value);
  }
});

$("copyBtn").addEventListener("click", async () => {
  if (!currentRows.length) return;

  const text = currentRows
    .map(r => `${r.position}\t${r.base} - ${r.complement}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    $("copyBtn").textContent = "Copiado!";
    setTimeout(() => {
      $("copyBtn").textContent = "▣ Copiar trecho";
    }, 1500);
  } catch {
    alert("Não foi possível copiar automaticamente. Selecione e copie manualmente.");
  }
});

// Analisador de sequência
$("exampleBtn").addEventListener("click", () => {
  $("analyzeInput").value =
    "ATGCGTACGTTAGCCTGATCGGTTACCGTACGATGCCGTTAGC";
});

$("analyzeBtn").addEventListener("click", async () => {
  const sequence = $("analyzeInput").value;
  $("analysisResult").innerHTML =
    '<div class="loading">Analisando...</div>';

  try {
    const d = await getJSON("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence })
    });

    const labels = {
      A: "Adenina",
      T: "Timina",
      C: "Citosina",
      G: "Guanina",
      N: "N (indeterminada)"
    };

    $("analysisResult").innerHTML = `
      <p><b>Comprimento:</b> ${formatNumber(d.length)} nucleotídeos ·
      <b>Conteúdo GC:</b> ${d.gc.toFixed(3)}%</p>

      <div class="result-grid">
        ${"ATGCN".split("").map(b => `
          <div class="result-cell">
            <b class="${colors[b]}">${b}: ${formatNumber(d.counts[b])}</b>
            <small>${d.percentages[b].toFixed(3)}% · ${labels[b]}</small>
          </div>
        `).join("")}
      </div>
    `;
  } catch (error) {
    $("analysisResult").innerHTML =
      `<p class="error">${escapeHTML(error.message)}</p>`;
  }
});

// Carrega o genoma ao abrir a página
loadStatus();

// Transcrição DNA → RNA
function cleanDNA(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function transcribeDNA(sequence, mode) {
  const dna = cleanDNA(sequence);

  if (!dna) {
    throw new Error("Cole uma sequência de DNA ou use o trecho exibido acima.");
  }

  const invalid = [...new Set(
    dna.split("").filter(base => !"ATGCN".includes(base))
  )];

  if (invalid.length) {
    throw new Error(
      "Caracteres inválidos: " + invalid.join(", ") +
      ". Use apenas A, T, C, G e N."
    );
  }

  if (mode === "template") {
    const complementRNA = {
      A: "U",
      T: "A",
      C: "G",
      G: "C",
      N: "N"
    };

    return dna.split("").map(base => complementRNA[base]).join("");
  }

  return dna.replace(/T/g, "U");
}

function colorRNA(sequence) {
  const rnaColors = {
    A: "base-a",
    U: "base-u",
    C: "base-c",
    G: "base-g",
    N: "base-n"
  };

  return (sequence.match(/.{1,10}/g) || []).map(chunk => `
    <span class="rna-chunk">
      ${[...chunk].map(base =>
        `<i class="${rnaColors[base] || ""}">${base}</i>`
      ).join("")}
    </span>
  `).join("");
}

$("useCurrentBtn").addEventListener("click", () => {
  if (!currentRows.length) {
    $("transcriptionResult").innerHTML =
      '<p class="error">Carregue primeiro um trecho do genoma.</p>';
    return;
  }

  $("transcribeInput").value =
    currentRows.map(row => row.base).join("");

  $("strandMode").value = "coding";

  $("transcriptionResult").innerHTML =
    '<p class="muted">Trecho copiado para a ferramenta. A fita foi tratada como codificadora; altere a opção para testar a fita molde.</p>';

  $("transcribeInput").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
});

$("transcribeExampleBtn").addEventListener("click", () => {
  $("transcribeInput").value = "ATGCGTACGTTAGC";
  $("strandMode").value = "coding";

  $("transcriptionResult").innerHTML =
    '<p class="muted">Exemplo carregado. Clique em “Transcrever para RNA”.</p>';
});

$("transcribeBtn").addEventListener("click", () => {
  const input = $("transcribeInput").value;
  const mode = $("strandMode").value;

  try {
    const rna = transcribeDNA(input, mode);

    const label = mode === "template"
      ? "Fita molde (3′ → 5′): RNA complementar"
      : "Fita codificadora (5′ → 3′): T substituído por U";

    $("transcriptionResult").innerHTML = `
      <div class="transcription-summary">
        <span class="result-pill">${label}</span>
        <span><b>${formatNumber(rna.length)}</b> nucleotídeos de RNA</span>
      </div>

      <div class="sequence-output">
        <h4>RNA mensageiro (RNAm) · sentido 5′ → 3′</h4>
        <div class="rna-sequence">${colorRNA(rna)}</div>
      </div>

      <div class="transcription-bottom">
        <button class="secondary" id="copyRNAButton">▣ Copiar RNA</button>
        <span class="muted">Bases presentes: A, U, C, G${rna.includes("N") ? " e N (indeterminada)" : ""}</span>
      </div>
    `;

    $("copyRNAButton").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(rna);
        $("copyRNAButton").textContent = "Copiado!";
      } catch {
        const helper = document.createElement("textarea");
        helper.value = rna;
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
        $("copyRNAButton").textContent = "Copiado!";
      }

      setTimeout(() => {
        const button = $("copyRNAButton");
        if (button) button.textContent = "▣ Copiar RNA";
      }, 1500);
    });
  } catch (error) {
    $("transcriptionResult").innerHTML =
      `<p class="error">${escapeHTML(error.message)}</p>`;
  }
});

// Controles do modelo 3D de DNA
const dna3dHelix = document.querySelector(".dna3d-helix");
const dna3dPauseBtn = document.getElementById("dna3dPauseBtn");
const dna3dSpeedBtn = document.getElementById("dna3dSpeedBtn");

if (dna3dHelix && dna3dPauseBtn) {
  dna3dPauseBtn.addEventListener("click", () => {
    const paused = dna3dHelix.classList.toggle("is-paused");

    dna3dPauseBtn.textContent = paused
      ? "▶ Retomar animação"
      : "❚❚ Pausar animação";
  });
}

if (dna3dHelix && dna3dSpeedBtn) {
  dna3dSpeedBtn.addEventListener("click", () => {
    const fast = dna3dHelix.classList.toggle("is-fast");

    dna3dSpeedBtn.textContent = fast
      ? "↘ Velocidade normal"
      : "↗ Acelerar";
  });
}


// Modelo 3D interativo de RNA — arraste para girar e use a roda para zoom.
(() => {
  const molecule = $("rna3d-molecule");
  const stage = $("rna3d-stage");
  const scene = document.querySelector(".rna3d-scene");
  const pauseButton = $("rna3d-pause");
  const speedButton = $("rna3d-speed");
  const shapeButton = $("rna3d-shape");
  const status = $("rna3d-status");
  const sequenceOutput = $("rna3d-sequence");
  if (!molecule || !stage || !scene || !pauseButton || !speedButton || !shapeButton || !status) return;

  const sequence = "AUGCUACGGAUCCGUA";
  const numberOfNodes = 32;
  let paused = false, fast = false, extended = false;
  let rotationX = -12, rotationY = 0, zoom = 1;
  let dragging = false, lastX = 0, lastY = 0;

  molecule.innerHTML = "";
  for (let i = 0; i < numberOfNodes; i++) {
    const base = sequence[i % sequence.length];
    const node = document.createElement("div");
    node.className = `rna3d-node rna-${base}`;
    node.textContent = base;
    node.title = `Nucleotídeo ${i + 1}: ${base}`;
    node.setAttribute("aria-label", `Nucleotídeo ${i + 1}, base ${base}`);
    node.style.setProperty("--node-y", `${(i - (numberOfNodes - 1) / 2) * 13}px`);
    node.style.setProperty("--node-angle", `${i * 24}deg`);
    node.style.setProperty("--node-radius", "65px");
    node.style.transform = `translateY(${(i - (numberOfNodes - 1) / 2) * 13}px) rotateY(${i * 24}deg) translateZ(65px)`;
    molecule.appendChild(node);
  }
  if (sequenceOutput) sequenceOutput.textContent = sequence;

  const applyView = () => {
    scene.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg) scale(${zoom})`;
  };
  applyView();

  stage.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    if (!dragging) return;
    rotationY += (e.clientX - lastX) * 0.7;
    rotationX -= (e.clientY - lastY) * 0.6;
    rotationX = Math.max(-75, Math.min(75, rotationX));
    lastX = e.clientX; lastY = e.clientY;
    applyView();
  });
  const stopDrag = () => { dragging = false; stage.classList.remove("is-dragging"); };
  stage.addEventListener("pointerup", stopDrag);
  stage.addEventListener("pointercancel", stopDrag);
  stage.addEventListener("wheel", e => {
    e.preventDefault();
    zoom = Math.max(0.65, Math.min(1.55, zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
    applyView();
    status.textContent = `Zoom: ${Math.round(zoom * 100)}%`;
  }, { passive: false });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    molecule.style.animationPlayState = paused ? "paused" : "running";
    pauseButton.textContent = paused ? "▶ Retomar" : "⏸ Pausar";
    status.textContent = paused ? "Animação pausada" : "Animação em andamento";
  });
  speedButton.addEventListener("click", () => {
    fast = !fast;
    molecule.style.animationDuration = fast ? "5s" : "12s";
    speedButton.textContent = fast ? "🐢 Velocidade normal" : "⚡ Acelerar";
    status.textContent = fast ? "Rotação acelerada" : "Velocidade normal";
  });
  shapeButton.addEventListener("click", () => {
    extended = !extended;
    const radius = extended ? 95 : 65;
    molecule.querySelectorAll(".rna3d-node").forEach((node, i) => {
      node.style.transform = `translateY(${(i - (numberOfNodes - 1) / 2) * 13}px) rotateY(${i * 24}deg) translateZ(${radius}px)`;
    });
    shapeButton.textContent = extended ? "↔ Formato compacto" : "↔ Mudar formato";
    status.textContent = extended ? "Representação visual mais aberta" : "Representação visual compacta";
  });
  const resetButton = $("rna3d-reset");
  if (resetButton) resetButton.addEventListener("click", () => {
    rotationX = -12; rotationY = 0; zoom = 1; applyView();
    status.textContent = "Visualização redefinida";
  });
})();

// Tradução educacional de RNA mensageiro em códons e aminoácidos.
(() => {
  const input = $("translateInput"), button = $("translateBtn"), output = $("translateResult");
  if (!input || !button || !output) return;
  const code = {
    UUU:"Fenilalanina",UUC:"Fenilalanina",UUA:"Leucina",UUG:"Leucina",
    UCU:"Serina",UCC:"Serina",UCA:"Serina",UCG:"Serina",
    UAU:"Tirosina",UAC:"Tirosina",UAA:"STOP",UAG:"STOP",
    UGU:"Cisteína",UGC:"Cisteína",UGA:"STOP",UGG:"Triptofano",
    CUU:"Leucina",CUC:"Leucina",CUA:"Leucina",CUG:"Leucina",
    CCU:"Prolina",CCC:"Prolina",CCA:"Prolina",CCG:"Prolina",
    CAU:"Histidina",CAC:"Histidina",CAA:"Glutamina",CAG:"Glutamina",
    CGU:"Arginina",CGC:"Arginina",CGA:"Arginina",CGG:"Arginina",
    AUU:"Isoleucina",AUC:"Isoleucina",AUA:"Isoleucina",AUG:"Metionina (início)",
    ACU:"Treonina",ACC:"Treonina",ACA:"Treonina",ACG:"Treonina",
    AAU:"Asparagina",AAC:"Asparagina",AAA:"Lisina",AAG:"Lisina",
    AGU:"Serina",AGC:"Serina",AGA:"Arginina",AGG:"Arginina",
    GUU:"Valina",GUC:"Valina",GUA:"Valina",GUG:"Valina",
    GCU:"Alanina",GCC:"Alanina",GCA:"Alanina",GCG:"Alanina",
    GAU:"Ácido aspártico",GAC:"Ácido aspártico",GAA:"Ácido glutâmico",GAG:"Ácido glutâmico",
    GGU:"Glicina",GGC:"Glicina",GGA:"Glicina",GGG:"Glicina"
  };
  button.addEventListener("click", () => {
    const seq = input.value.toUpperCase().replace(/\s/g, "");
    if (!seq || /[^AUCG]/.test(seq)) {
      output.textContent = "Digite uma sequência de RNA usando somente A, U, C e G.";
      return;
    }
    const rows = [];
    for (let i = 0; i + 2 < seq.length; i += 3) {
      const codon = seq.slice(i, i + 3);
      rows.push({ codon, amino: code[codon] || "Códon desconhecido" });
      if (code[codon] === "STOP") break;
    }
    output.innerHTML = rows.map(r => `<span class="codon-chip"><b>${r.codon}</b><small>${r.amino}</small></span>`).join("") +
      (seq.length % 3 ? `<p class="muted">Os ${seq.length % 3} nucleotídeo(s) finais não formam um códon completo e foram ignorados.</p>` : "");
  });
})();
