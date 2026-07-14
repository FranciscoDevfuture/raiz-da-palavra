// Raiz da Palavra — Leitor Bíblico
// Busca o texto de cada versão em fontes abertas no GitHub e normaliza
// tudo para um formato único: array de livros { nome, capitulos: [ [versiculo, ...] ] }

const VERSOES = {
  ntlh: {
    label: "Nova Tradução na Linguagem de Hoje",
    sigla: "NTLH",
    editora: "Sociedade Bíblica do Brasil, 1988",
    url: "https://github.com/damarals/biblias/releases/latest/download/NTLH.json",
    formato: "damarals",
  },
  ara: {
    label: "Almeida Revista e Atualizada",
    sigla: "ARA",
    editora: "Sociedade Bíblica do Brasil, 1993",
    url: "https://github.com/damarals/biblias/releases/latest/download/ARA.json",
    formato: "damarals",
  },
  nvt: {
    label: "Nova Versão Transformadora",
    sigla: "NVT",
    editora: "Mundo Cristão, 2016",
    url: "https://github.com/damarals/biblias/releases/latest/download/NVT.json",
    formato: "damarals",
  },
  avemaria: {
    label: "Edição Católica (Ave Maria)",
    sigla: "Ave Maria",
    editora: "Editora Ave-Maria",
    url: "https://raw.githubusercontent.com/fidalgobr/bibliaAveMariaJSON/main/bibliaAveMaria.json",
    formato: "avemaria",
  },
};

// Cache em memória por versão, para não baixar de novo ao trocar e voltar
const cache = {};

function normalizarDamarals(json) {
  // json: [ { abbrev, name, chapters: [ [versiculo, ...], ... ] }, ... ]
  return json.map((livro) => ({
    nome: livro.name,
    capitulos: livro.chapters,
  }));
}

function normalizarAveMaria(json) {
  // json: { antigoTestamento: [ { nome, capitulos: [ { capitulo, versiculos: [{versiculo, texto}] } ] } ], novoTestamento: [...] }
  const todos = [...json.antigoTestamento, ...json.novoTestamento];
  return todos.map((livro) => ({
    nome: livro.nome,
    capitulos: livro.capitulos.map((cap) =>
      cap.versiculos
        .sort((a, b) => a.versiculo - b.versiculo)
        .map((v) => v.texto)
    ),
  }));
}

async function carregarVersao(chave) {
  if (cache[chave]) return cache[chave];

  const config = VERSOES[chave];
  const resp = await fetch(config.url);
  if (!resp.ok) throw new Error("Falha ao buscar " + config.label);
  const json = await resp.json();

  const livros =
    config.formato === "damarals"
      ? normalizarDamarals(json)
      : normalizarAveMaria(json);

  cache[chave] = livros;
  return livros;
}

// ---------- Estado e UI ----------

const estado = {
  versao: null,
  livros: null,
  livroIdx: 0,
  capIdx: 0,
};

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
  const livro = estado.livros[estado.livroIdx];
  const versiculos = livro.capitulos[estado.capIdx];

  el.texto.innerHTML =
    `<h2>${livro.nome} ${estado.capIdx + 1}</h2>` +
    versiculos
      .map(
        (v, i) =>
          `<p class="versiculo"><span class="num">${i + 1}</span>${v}</p>`
      )
      .join("");

  const config = VERSOES[estado.versao];
  el.texto.innerHTML += `<p class="creditos-versao">${config.label} (${config.sigla}) — ${config.editora}</p>`;

  el.btnAnterior.disabled = estado.livroIdx === 0 && estado.capIdx === 0;
  const ultimoLivro = estado.livros.length - 1;
  const ultimoCap = estado.livros[ultimoLivro].capitulos.length - 1;
  el.btnProximo.disabled =
    estado.livroIdx === ultimoLivro && estado.capIdx === ultimoCap;

  window.scrollTo({ top: el.wrapTexto.offsetTop - 20, behavior: "smooth" });
  salvarPosicao();
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

el.fonteMenor.addEventListener("click", () => {
  el.wrapTexto.classList.remove("texto-tamanho-grande");
  el.wrapTexto.classList.add("texto-tamanho-pequeno");
});
el.fonteMaior.addEventListener("click", () => {
  el.wrapTexto.classList.remove("texto-tamanho-pequeno");
  el.wrapTexto.classList.add("texto-tamanho-grande");
});

// Inicialização: restaura a última posição de leitura, se houver
const posicaoSalva = lerPosicaoSalva();
const versaoInicial = (posicaoSalva && posicaoSalva.versao) || "ntlh";
el.selectVersao.value = versaoInicial;
trocarVersao(versaoInicial, posicaoSalva);
