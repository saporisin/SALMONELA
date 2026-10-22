from collections import Counter
from pathlib import Path
import threading
import urllib.error
import urllib.request

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # limite para POST /api/analyze

REFERENCE = "NC_003197.2"
ORGANISM = "Salmonella enterica serovar Typhimurium LT2"
URL = (
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    "efetch.fcgi?db=nuccore&id=NC_003197.2&rettype=fasta&retmode=text"
)
CACHE_FILE = Path(__file__).resolve().parent / "salmonella_sequence.txt"
COMPLEMENTO = {"A": "T", "T": "A", "C": "G", "G": "C", "N": "N"}
VALID_BASES = frozenset(COMPLEMENTO)
DNA = None
DNA_LOCK = threading.Lock()


def _validar_sequencia(seq):
    """Valida uma sequência FASTA simplificada, permitindo N como base desconhecida."""
    return bool(seq) and not (set(seq) - VALID_BASES)


def _ler_fasta(texto):
    linhas = texto.splitlines()
    seq = "".join(
        linha.strip().upper()
        for linha in linhas
        if linha.strip() and not linha.startswith(">")
    )
    if not _validar_sequencia(seq):
        raise ValueError("A sequência recebida está vazia ou contém bases inválidas.")
    return seq


def carregar_genoma():
    """Carrega o genoma uma única vez; usa o cache local e recorre ao NCBI se necessário."""
    global DNA
    if DNA is not None:
        return DNA

    with DNA_LOCK:
        if DNA is not None:
            return DNA

        if CACHE_FILE.is_file():
            try:
                cached = "".join(CACHE_FILE.read_text(encoding="utf-8").split()).upper()
                if _validar_sequencia(cached):
                    DNA = cached
                    return DNA
            except (OSError, UnicodeError):
                # Cache ilegível: tenta recuperar a sequência pela fonte oficial.
                pass

        req = urllib.request.Request(
            URL,
            headers={"User-Agent": "SalmonellaGenomeViewer/2.0 (educational local project)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                fasta = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, UnicodeError) as exc:
            raise RuntimeError(
                "Não foi possível carregar o genoma do NCBI. Verifique a conexão "
                "com a internet e tente novamente."
            ) from exc

        seq = _ler_fasta(fasta)
        # Gravação simples após validar os dados recebidos.
        try:
            CACHE_FILE.write_text(seq, encoding="utf-8")
        except OSError:
            # O app ainda pode funcionar mesmo se a pasta estiver sem permissão de escrita.
            app.logger.warning("Não foi possível atualizar o cache local do genoma.")
        DNA = seq
        return DNA


def resposta_erro(mensagem, status=400):
    return jsonify({"ok": False, "error": mensagem}), status


def contagens(seq):
    c = Counter(seq)
    return {base: c.get(base, 0) for base in "ATGCN"}


@app.errorhandler(413)
def payload_too_large(_error):
    return resposta_erro("O conteúdo enviado é grande demais (limite de 2 MB).", 413)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health():
    """Verificação simples do servidor, sem forçar download do genoma."""
    return jsonify({"ok": True, "service": "Salmonella Genome Viewer", "version": "2.0"})


@app.route("/api/status")
def status():
    try:
        dna = carregar_genoma()
        return jsonify({
            "ok": True,
            "reference": REFERENCE,
            "organism": ORGANISM,
            "length": len(dna),
            "source": "local cache" if CACHE_FILE.is_file() else "NCBI E-utilities",
        })
    except Exception:
        app.logger.exception("Falha ao carregar a referência genômica.")
        return resposta_erro(
            "Não foi possível carregar o genoma. Verifique a internet e tente novamente.",
            502,
        )


@app.route("/api/sequence")
def sequence():
    try:
        start = int(request.args.get("start", "1"))
        limit = int(request.args.get("limit", "100"))
    except (TypeError, ValueError):
        return resposta_erro("Use números inteiros válidos para start e limit.")

    if start < 1:
        return resposta_erro("start deve ser maior ou igual a 1.")
    if not 1 <= limit <= 500:
        return resposta_erro("limit deve estar entre 1 e 500.")

    try:
        dna = carregar_genoma()
        if start > len(dna):
            return resposta_erro(f"start excede o tamanho do genoma ({len(dna)} bases).")
        end = min(start + limit - 1, len(dna))
        seq = dna[start - 1:end]
        rows = [
            {"position": start + i, "base": base, "complement": COMPLEMENTO[base]}
            for i, base in enumerate(seq)
        ]
        return jsonify({"start": start, "end": end, "total": len(dna), "rows": rows})
    except Exception:
        app.logger.exception("Falha na rota /api/sequence.")
        return resposta_erro("Não foi possível consultar a sequência agora.", 502)


@app.route("/api/stats")
def stats():
    try:
        dna = carregar_genoma()
        total = len(dna)
        counts = contagens(dna)
        percentages = {
            base: round(count / total * 100, 4) if total else 0
            for base, count in counts.items()
        }
        gc = ((counts["G"] + counts["C"]) / total * 100) if total else 0
        return jsonify({
            "total": total,
            "counts": counts,
            "percentages": percentages,
            "gc": round(gc, 4),
            "reference": REFERENCE,
        })
    except Exception:
        app.logger.exception("Falha na rota /api/stats.")
        return resposta_erro("Não foi possível calcular as estatísticas agora.", 502)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return resposta_erro("Envie um objeto JSON com o campo 'sequence'.")

    seq = "".join(str(data.get("sequence", "")).upper().split())
    if not seq:
        return resposta_erro("Cole uma sequência de DNA primeiro.")
    invalidas = set(seq) - VALID_BASES
    if invalidas:
        return resposta_erro("Use apenas A, T, C, G e, se necessário, N.")

    total = len(seq)
    counts = contagens(seq)
    return jsonify({
        "length": total,
        "counts": counts,
        "percentages": {base: round(n / total * 100, 3) for base, n in counts.items()},
        "gc": round((counts["G"] + counts["C"]) / total * 100, 3),
    })


def complemento_reverso(seq):
    return "".join(COMPLEMENTO[b] for b in reversed(seq))


def posicoes(dna, motivo, maximo=200):
    achados = []
    total = 0
    i = dna.find(motivo)
    while i != -1:
        total += 1
        if len(achados) < maximo:
            achados.append(i + 1)  # posições em coordenadas 1-based
        i = dna.find(motivo, i + 1)
    return {"count": total, "positions": achados}


@app.route("/api/search")
def search():
    q = "".join(request.args.get("q", "").upper().split())
    if not 3 <= len(q) <= 60:
        return resposta_erro("Digite um motivo de 3 a 60 bases.")
    if set(q) - set("ATCG"):
        return resposta_erro("Use apenas A, T, C e G.")

    try:
        dna = carregar_genoma()
        rc = complemento_reverso(q)
        return jsonify({
            "query": q,
            "reverse_complement": rc,
            "plus": posicoes(dna, q),
            "minus": posicoes(dna, rc) if rc != q else {"count": 0, "positions": []},
            "palindrome": rc == q,
            "length": len(dna),
        })
    except Exception:
        app.logger.exception("Falha na rota /api/search.")
        return resposta_erro("Não foi possível pesquisar o motivo agora.", 502)


@app.route("/api/gc")
def gc_windows():
    try:
        windows = int(request.args.get("windows", "240"))
    except (TypeError, ValueError):
        return resposta_erro("windows deve ser um número inteiro.")
    if not 10 <= windows <= 1000:
        return resposta_erro("windows deve estar entre 10 e 1000.")

    try:
        dna = carregar_genoma()
        chunk_size = (len(dna) + windows - 1) // windows
        valores = []
        for i in range(0, len(dna), chunk_size):
            seg = dna[i:i + chunk_size]
            valores.append(round((seg.count("G") + seg.count("C")) / len(seg) * 100, 3))
        counts = contagens(dna)
        media = (counts["G"] + counts["C"]) / len(dna) * 100
        return jsonify({
            "window": chunk_size,
            "values": valores,
            "mean": round(media, 3),
            "length": len(dna),
        })
    except Exception:
        app.logger.exception("Falha na rota /api/gc.")
        return resposta_erro("Não foi possível calcular o conteúdo GC por região.", 502)


@app.route("/api/download")
def download():
    try:
        dna = carregar_genoma()
        fasta = f">{REFERENCE} {ORGANISM}\n" + "\n".join(
            dna[i:i + 70] for i in range(0, len(dna), 70)
        ) + "\n"
        return app.response_class(
            response=fasta,
            status=200,
            mimetype="text/plain",
            headers={"Content-Disposition": 'attachment; filename="salmonella_NC_003197.2.fasta"'},
        )
    except Exception:
        app.logger.exception("Falha ao preparar o download FASTA.")
        return resposta_erro("Não foi possível preparar o download agora.", 502)


if __name__ == "__main__":
    print("Salmonella Genome Viewer 2.0")
    print("Abra no navegador: http://127.0.0.1:5000")
    # debug=False evita o depurador interativo e o recarregamento duplo.
    app.run(host="127.0.0.1", port=5000, debug=False)
