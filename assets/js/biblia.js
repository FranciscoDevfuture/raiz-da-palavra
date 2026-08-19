// Raiz da Palavra — Leitor Bíblico
// Busca o texto de cada versão em fontes abertas no GitHub e normaliza
// tudo para um formato único: array de livros { nome, capitulos: [ [versiculo, ...] ] }

const VERSOES = {
  ntlh: {
    label: "Nova Tradução na Linguagem de Hoje",
    sigla: "NTLH",
    editora: "Sociedade Bíblica do Brasil, 1988",
    url: "assets/data/ntlh.json",
  },
  ara: {
    label: "Almeida Revista e Atualizada",
    sigla: "ARA",
    editora: "Sociedade Bíblica do Brasil, 1993",
    url: "assets/data/ara.json",
  },
  nvt: {
    label: "Nova Versão Transformadora",
    sigla: "NVT",
    editora: "Mundo Cristão, 2016",
    url: "assets/data/nvt.json",
  },
  avemaria: {
    label: "Edição Católica (Ave Maria)",
    sigla: "Ave Maria",
    editora: "Editora Ave-Maria",
    url: "assets/data/avemaria.json",
  },
};

// Cache em memória por versão, para não baixar de novo ao trocar e voltar
const cache = {};

async function carregarVersao(chave) {
  if (cache[chave]) return cache[chave];

  const config = VERSOES[chave];
  const resp = await fetch(config.url);
  if (!resp.ok) throw new Error("Falha ao buscar " + config.label);
  const livros = await resp.json();

  cache[chave] = livros;
  return livros;
}

// ---------- Estado e UI ----------

const estado = {
  versao: null,
  livros: null,
  livroIdx: 0,
  capIdx: 0,
  modo: "leitura", // "leitura" | "busca"
  versiculoParaDestacar: null,
};

function removerAcentos(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const el = {
  selectVersao: document.getElementById("select-versao"),
  selectLivro: document.getElementById("select-livro"),
  selectCapitulo: document.getElementById("select-capitulo"),
  btnAnterior: document.getElementById("btn-anterior"),
  btnProximo: document.getElementById("btn-proximo"),
  texto: document.getElementById("biblia-texto-conteudo"),
  wrapTexto: document.getElementById("biblia-texto-wrap"),
  fonteMenor: document.getElementById("fonte-menor"),
  fonteMaior: document.getElementById("fonte-maior"),
  buscaInput: document.getElementById("busca-input"),
  buscaBtn: document.getElementById("busca-btn"),
};

function salvarPosicao() {
  try {
    localStorage.setItem(
      "raizdapalavra:biblia:posicao",
      JSON.stringify({
        versao: estado.versao,
        livroIdx: estado.livroIdx,
        capIdx: estado.capIdx,
      })
    );
  } catch (e) {
    /* localStorage indisponível, ignora */
  }
}

function lerPosicaoSalva() {
  try {
    const raw = localStorage.getItem("raizdapalavra:biblia:posicao");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function popularSelectLivros() {
  el.selectLivro.innerHTML = estado.livros
    .map((livro, i) => `<option value="${i}">${livro.nome}</option>`)
    .join("");
  el.selectLivro.value = estado.livroIdx;
}

function popularSelectCapitulos() {
  const total = estado.livros[estado.livroIdx].capitulos.length;
  const opcoes = [];
  for (let i = 0; i < total; i++) {
    opcoes.push(`<option value="${i}">${i + 1}</option>`);
  }
  el.selectCapitulo.innerHTML = opcoes.join("");
  el.selectCapitulo.value = estado.capIdx;
}

function renderizarTexto() {
  estado.modo = "leitura";
  const livro = estado.livros[estado.livroIdx];
  const versiculos = livro.capitulos[estado.capIdx];

  el.texto.innerHTML =
    `<h2>${livro.nome} ${estado.capIdx + 1}</h2>` +
    versiculos
      .map((v, i) => {
        const destacado = estado.versiculoParaDestacar === i ? " destacado" : "";
        return `<p class="versiculo${destacado}" id="v-${i}"><span class="num">${i + 1}</span>${v}</p>`;
      })
      .join("");

  const config = VERSOES[estado.versao];
  el.texto.innerHTML += `<p class="creditos-versao">${config.label} (${config.sigla}) — ${config.editora}</p>`;

  el.btnAnterior.disabled = estado.livroIdx === 0 && estado.capIdx === 0;
  const ultimoLivro = estado.livros.length - 1;
  const ultimoCap = estado.livros[ultimoLivro].capitulos.length - 1;
  el.btnProximo.disabled =
    estado.livroIdx === ultimoLivro && estado.capIdx === ultimoCap;

  if (estado.versiculoParaDestacar !== null) {
    const alvo = document.getElementById(`v-${estado.versiculoParaDestacar}`);
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    estado.versiculoParaDestacar = null;
  } else {
    window.scrollTo({ top: el.wrapTexto.offsetTop - 20, behavior: "smooth" });
  }
  salvarPosicao();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function destacarTermo(texto, termoOriginal) {
  const escapado = termoOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapado})`, "gi");
  return escapeHtml(texto).replace(regex, "<mark>$1</mark>");
}

function executarBusca() {
  const termo = el.buscaInput.value.trim();
  if (termo.length < 3) {
    el.texto.innerHTML = `<p class="estado-msg">Digite pelo menos 3 letras pra buscar.</p>`;
    estado.modo = "busca";
    return;
  }

  const termoNormalizado = removerAcentos(termo);
  const resultados = [];
  const LIMITE = 150;

  for (let li = 0; li < estado.livros.length && resultados.length < LIMITE; li++) {
    const livro = estado.livros[li];
    for (let ci = 0; ci < livro.capitulos.length && resultados.length < LIMITE; ci++) {
      const versiculos = livro.capitulos[ci];
      for (let vi = 0; vi < versiculos.length && resultados.length < LIMITE; vi++) {
        if (removerAcentos(versiculos[vi]).includes(termoNormalizado)) {
          resultados.push({ li, ci, vi, nome: livro.nome, texto: versiculos[vi] });
        }
      }
    }
  }

  estado.modo = "busca";

  if (resultados.length === 0) {
    el.texto.innerHTML = `<button class="busca-voltar" id="busca-voltar-btn" type="button">&larr; Voltar pra leitura</button><p class="estado-msg">Nenhum resultado para "${escapeHtml(termo)}".</p>`;
  } else {
    const aviso = resultados.length === LIMITE
      ? `Mostrando os primeiros ${LIMITE} resultados. Tente um termo mais específico pra refinar.`
      : `${resultados.length} resultado${resultados.length > 1 ? "s" : ""} encontrado${resultados.length > 1 ? "s" : ""}.`;

    el.texto.innerHTML =
      `<button class="busca-voltar" id="busca-voltar-btn" type="button">&larr; Voltar pra leitura</button>` +
      `<p class="busca-info">${aviso}</p>` +
      resultados
        .map(
          (r) =>
            `<a class="resultado-busca" data-li="${r.li}" data-ci="${r.ci}" data-vi="${r.vi}">` +
            `<span class="ref">${r.nome} ${r.ci + 1}:${r.vi + 1}</span>` +
            destacarTermo(r.texto, termo) +
            `</a>`
        )
        .join("");
  }

  el.texto.querySelectorAll(".resultado-busca").forEach((elemento) => {
    elemento.addEventListener("click", () => {
      estado.livroIdx = Number(elemento.dataset.li);
      estado.capIdx = Number(elemento.dataset.ci);
      estado.versiculoParaDestacar = Number(elemento.dataset.vi);
      popularSelectLivros();
      popularSelectCapitulos();
      renderizarTexto();
    });
  });

  const botaoVoltar = document.getElementById("busca-voltar-btn");
  if (botaoVoltar) botaoVoltar.addEventListener("click", () => renderizarTexto());
}

async function trocarVersao(chave, posicaoInicial) {
  el.texto.innerHTML = `<p class="estado-msg">Carregando o texto da ${VERSOES[chave].label}…</p>`;
  el.selectLivro.disabled = true;
  el.selectCapitulo.disabled = true;

  try {
    const livros = await carregarVersao(chave);
    estado.versao = chave;
    estado.livros = livros;
    estado.livroIdx = posicaoInicial ? Math.min(posicaoInicial.livroIdx, livros.length - 1) : 0;
    estado.capIdx = 0;

    if (posicaoInicial) {
      const totalCaps = livros[estado.livroIdx].capitulos.length;
      estado.capIdx = Math.min(posicaoInicial.capIdx, totalCaps - 1);
    }

    popularSelectLivros();
    popularSelectCapitulos();
    el.selectLivro.disabled = false;
    el.selectCapitulo.disabled = false;
    renderizarTexto();
  } catch (err) {
    el.texto.innerHTML = `<p class="estado-msg">Não foi possível carregar esta versão agora. Verifique sua conexão e tente novamente.</p>`;
    console.error(err);
  }
}

el.selectVersao.addEventListener("change", () => {
  trocarVersao(el.selectVersao.value);
});

el.selectLivro.addEventListener("change", () => {
  estado.livroIdx = Number(el.selectLivro.value);
  estado.capIdx = 0;
  popularSelectCapitulos();
  renderizarTexto();
});

el.selectCapitulo.addEventListener("change", () => {
  estado.capIdx = Number(el.selectCapitulo.value);
  renderizarTexto();
});

el.btnAnterior.addEventListener("click", () => {
  if (estado.capIdx > 0) {
    estado.capIdx -= 1;
  } else if (estado.livroIdx > 0) {
    estado.livroIdx -= 1;
    estado.capIdx = estado.livros[estado.livroIdx].capitulos.length - 1;
  }
  popularSelectLivros();
  popularSelectCapitulos();
  renderizarTexto();
});

el.btnProximo.addEventListener("click", () => {
  const totalCaps = estado.livros[estado.livroIdx].capitulos.length;
  if (estado.capIdx < totalCaps - 1) {
    estado.capIdx += 1;
  } else if (estado.livroIdx < estado.livros.length - 1) {
    estado.livroIdx += 1;
    estado.capIdx = 0;
  }
  popularSelectLivros();
  popularSelectCapitulos();
  renderizarTexto();
});

el.buscaBtn.addEventListener("click", () => {
  if (!estado.livros) return;
  executarBusca();
});

el.buscaInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    if (!estado.livros) return;
    executarBusca();
  }
});

el.fonteMenor.addEventListener("click", () => {
  el.wrapTexto.classList.remove("texto-tamanho-grande");
  el.wrapTexto.classList.add("texto-tamanho-pequeno");
});
el.fonteMaior.addEventListener("click", () => {
  el.wrapTexto.classList.remove("texto-tamanho-pequeno");
  el.wrapTexto.classList.add("texto-tamanho-grande");
});

// Inicialização: chamada pela index.html quando a aba "Bíblia" é aberta
// pela primeira vez (evita baixar o texto bíblico se o usuário nunca abrir a aba)
window.iniciarLeitorBiblico = function () {
  const posicaoSalva = lerPosicaoSalva();
  const versaoInicial = (posicaoSalva && posicaoSalva.versao) || "ntlh";
  el.selectVersao.value = versaoInicial;
  trocarVersao(versaoInicial, posicaoSalva);
};

// Se a página já abrir direto na aba Bíblia (ex: link com #biblia),
// a própria index.html chama iniciarLeitorBiblico() — nada a fazer aqui.
