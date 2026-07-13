# Raiz da Palavra

Site de estudos bíblicos diários, gerados automaticamente por IA (Groq / LLaMA 3.3 70B)
a partir de uma fila de temas que você controla, e publicados via GitHub Pages.

> "Ele será como a árvore plantada junto a ribeiros de águas, que dá o seu fruto no seu tempo." — Salmo 1:3

## Como funciona

1. Você adiciona temas e passagens em `data/temas.json`.
2. Todo dia, às 6h (horário de Brasília), o GitHub Actions roda `scripts/gerar_estudo.py`.
3. O script chama a Groq, gera o estudo do dia (introdução, contexto, o texto, aplicação e oração),
   salva como uma página em `estudos/AAAA-MM-DD.html` e atualiza `index.html` automaticamente.
4. O GitHub Pages publica o site sozinho a cada commit.

Você só precisa alimentar a fila de temas — o resto é automático.

## Passo a passo para colocar no ar

### 1. Criar o repositório no GitHub

```bash
cd raiz-da-palavra
git init
git add .
git commit -m "Primeira versão do Raiz da Palavra"
git branch -M main
git remote add origin https://github.com/FranciscoDevfuture/raiz-da-palavra.git
git push -u origin main
```

(Crie antes o repositório vazio em github.com/new, sem README/gitignore, pra não dar conflito.)

### 2. Ativar o GitHub Pages

No repositório: **Settings → Pages → Source → Deploy from a branch → branch `main`, pasta `/ (root)`**.

Depois de alguns minutos, o site estará em:
`https://franciscodevfuture.github.io/raiz-da-palavra/`

### 3. Configurar a chave da Groq como segredo

No repositório: **Settings → Secrets and variables → Actions → New repository secret**

- Nome: `GROQ_API_KEY`
- Valor: sua chave da Groq (a mesma que você já usa nos outros projetos)

Sem isso, o workflow vai falhar ao tentar gerar o estudo.

### 4. Testar a automação manualmente (sem esperar o cron)

No repositório: **Actions → Publicar estudo bíblico diário → Run workflow**

Isso roda o processo agora, sem esperar o horário programado — bom pra validar que tudo está certo
antes de confiar 100% no agendamento.

## Alimentando a fila de temas

Edite `data/temas.json` e adicione novos itens no formato:

```json
{
  "data": "2026-07-20",
  "tema": "A parábola do semeador",
  "passagem": "Mateus 13:1-9",
  "gerado": false
}
```

- `data`: dia em que o estudo deve ser publicado (formato AAAA-MM-DD)
- `gerado`: sempre comece com `false` — o script marca como `true` depois de publicar

**Importante**: se não houver um tema com a data de hoje, o script pega o próximo pendente
mais antigo da fila, então o site nunca fica "vazio" enquanto houver itens não gerados —
mas o ideal é manter a fila alimentada com pelo menos 1-2 semanas de antecedência.

## Testando localmente (no seu PC)

```bash
cd scripts
pip install -r requirements.txt
set GROQ_API_KEY=sua_chave_aqui   # Windows (cmd)
python gerar_estudo.py
```

Isso gera o próximo estudo pendente e atualiza os arquivos localmente, sem precisar do GitHub Actions.
Abra `index.html` no navegador pra conferir antes de subir.

## Estrutura do projeto

```
raiz-da-palavra/
├── index.html                 → página inicial (lista de estudos)
├── assets/
│   ├── css/style.css          → identidade visual do site
│   └── root-deco.svg          → ilustração decorativa
├── estudos/                   → páginas geradas (uma por dia)
├── data/temas.json            → fila de temas a gerar
├── scripts/
│   ├── gerar_estudo.py        → script principal
│   ├── template_estudo.html   → template usado para montar cada página
│   └── requirements.txt
└── .github/workflows/
    └── publicar-estudo.yml    → automação diária (GitHub Actions)
```

## Personalizações fáceis

- **Trocar o horário de publicação**: edite o `cron` em `.github/workflows/publicar-estudo.yml`
  (o horário do cron é sempre em UTC; Brasília = UTC-3).
- **Mudar o estilo do estudo gerado**: ajuste o `SYSTEM_PROMPT` em `scripts/gerar_estudo.py`.
- **Trocar o modelo**: altere a constante `MODELO` em `scripts/gerar_estudo.py`
  (ex: `llama-3.1-8b-instant` para respostas mais rápidas e baratas).
