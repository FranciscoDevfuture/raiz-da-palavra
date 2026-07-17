#!/usr/bin/env python3
"""
Raiz da Palavra — gerador diário de estudos bíblicos.

O que este script faz:
1. Lê a fila de temas em data/temas.json
2. Encontra o tema referente à data de hoje (ou o tema atrasado mais antigo)
3. Pede ao modelo (Groq / LLaMA 3.3 70B) para escrever um estudo completo
4. Salva o estudo como página HTML em estudos/AAAA-MM-DD.html
5. Atualiza a lista de estudos em index.html
6. Marca o tema como "gerado" em data/temas.json

Executado automaticamente todo dia pelo GitHub Actions
(.github/workflows/publicar-estudo.yml), mas também pode
rodar manualmente:  python scripts/gerar_estudo.py
"""

import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from string import Template
from zoneinfo import ZoneInfo

from groq import Groq

RAIZ = Path(__file__).resolve().parent.parent
TEMAS_PATH = RAIZ / "data" / "temas.json"
ESTUDOS_DIR = RAIZ / "estudos"
INDEX_PATH = RAIZ / "index.html"

MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

MODELO = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """\
Você é um teólogo e escritor devocional experiente, que escreve estudos
bíblicos diários para um público leigo, mas engajado. Seu tom é acolhedor,
claro e reverente — nunca acadêmico demais, nunca raso.

Sempre responda em português do Brasil.

Estruture cada estudo com estas seções, usando exatamente estes títulos:

INTRODUÇÃO
(2-3 frases que conectam o tema à vida cotidiana do leitor)

CONTEXTO
(explique brevemente quem escreveu o texto, para quem, e a situação histórica)

O TEXTO
(inclua a citação da passagem bíblica indicada, e depois explique seu
significado, versículo a versículo ou por blocos de sentido)

APLICAÇÃO
(2-3 parágrafos práticos: como viver isso hoje, com exemplos concretos)

ORAÇÃO
(uma oração curta e pessoal, de 3-5 frases, ligada ao tema do dia)

Não use markdown. Separe as seções apenas com os títulos em maiúsculas,
exatamente como mostrado acima, cada um em sua própria linha.
"""


def carregar_temas():
    if not TEMAS_PATH.exists():
        print(f"Arquivo não encontrado: {TEMAS_PATH}")
        sys.exit(1)
    with open(TEMAS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def salvar_temas(temas):
    with open(TEMAS_PATH, "w", encoding="utf-8") as f:
        json.dump(temas, f, ensure_ascii=False, indent=2)


def escolher_tema(temas):
    """Prioriza o tema com a data de hoje; senão, pega o mais antigo atrasado
    (nunca um tema com data futura, mesmo que já esteja pendente).

    CORREÇÃO: antes, o fallback pegava o "próximo pendente" ordenado por
    data sem checar se essa data já tinha chegado. Isso fazia o script
    publicar o estudo de amanhã antecipadamente sempre que rodasse mais
    de uma vez no mesmo dia (ex: re-run manual, retry após falha) com o
    tema de hoje já marcado como "gerado". Agora o fallback só considera
    temas cuja data já passou (atrasados), nunca datas futuras.
    """
    hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()

    for item in temas:
        if item["data"] == hoje and not item.get("gerado"):
            return item

    atrasados = [
        t for t in temas
        if not t.get("gerado") and t["data"] < hoje
    ]
    if not atrasados:
        return None
    return sorted(atrasados, key=lambda t: t["data"])[0]


def chamar_groq(tema, passagem):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("Variável de ambiente GROQ_API_KEY não definida.")
        sys.exit(1)

    client = Groq(api_key=api_key)

    mensagem_usuario = (
        f"Tema do estudo de hoje: {tema}\n"
        f"Passagem bíblica: {passagem}\n\n"
        "Escreva o estudo completo seguindo exatamente a estrutura pedida."
    )

    resposta = client.chat.completions.create(
        model=MODELO,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": mensagem_usuario},
        ],
        temperature=0.7,
        max_tokens=2000,
    )
    return resposta.choices[0].message.content


def parsear_secoes(texto):
    """Quebra a resposta da IA nas 5 seções esperadas."""
    titulos = ["INTRODUÇÃO", "CONTEXTO", "O TEXTO", "APLICAÇÃO", "ORAÇÃO"]
    padrao = "|".join(titulos)
    partes = re.split(rf"^({padrao})\s*$", texto, flags=re.MULTILINE)

    secoes = {}
    atual = None
    for parte in partes:
        parte_limpa = parte.strip()
        if parte_limpa in titulos:
            atual = parte_limpa
        elif atual:
            secoes[atual] = parte_limpa

    return secoes


def secao_para_html(texto):
    """Converte parágrafos separados por linha em branco em <p>."""
    paragrafos = [p.strip() for p in texto.split("\n\n") if p.strip()]
    return "\n".join(f"    <p>{p}</p>" for p in paragrafos)


def data_por_extenso(data_iso):
    d = datetime.strptime(data_iso, "%Y-%m-%d")
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def montar_pagina_estudo(item, secoes):
    template = Template((RAIZ / "scripts" / "template_estudo.html").read_text(encoding="utf-8"))
    return template.substitute(
        tema=item["tema"],
        passagem=item["passagem"],
        data_extenso=data_por_extenso(item["data"]),
        introducao=secao_para_html(secoes.get("INTRODUÇÃO", "")),
        contexto=secao_para_html(secoes.get("CONTEXTO", "")),
        texto=secao_para_html(secoes.get("O TEXTO", "")),
        aplicacao=secao_para_html(secoes.get("APLICAÇÃO", "")),
        oracao=secoes.get("ORAÇÃO", "").strip(),
    )


def atualizar_index(item, arquivo_relativo):
    html = INDEX_PATH.read_text(encoding="utf-8")

    novo_card = f"""
      <article class="entry">
        <span class="data">{data_por_extenso(item["data"])}</span>
        <h2><a href="{arquivo_relativo}">{item["tema"]}</a></h2>
        <p class="passagem">{item["passagem"]}</p>
      </article>
"""

    marcador = "<!-- NOVOS-ESTUDOS-AQUI -->"
    if marcador not in html:
        print("Marcador não encontrado em index.html — pulei a atualização do índice.")
        return

    html = html.replace(marcador, marcador + novo_card)
    INDEX_PATH.write_text(html, encoding="utf-8")


def main():
    temas = carregar_temas()
    item = escolher_tema(temas)

    if item is None:
        print("Nenhum tema pendente na fila. Adicione mais temas em data/temas.json.")
        return

    print(f"Gerando estudo: {item['tema']} ({item['passagem']}) — {item['data']}")

    texto_bruto = chamar_groq(item["tema"], item["passagem"])
    secoes = parsear_secoes(texto_bruto)

    faltando = [s for s in ["INTRODUÇÃO", "CONTEXTO", "O TEXTO", "APLICAÇÃO", "ORAÇÃO"] if s not in secoes]
    if faltando:
        print(f"Aviso: seções não encontradas na resposta da IA: {faltando}")

    html_final = montar_pagina_estudo(item, secoes)

    nome_arquivo = f"{item['data']}.html"
    caminho_saida = ESTUDOS_DIR / nome_arquivo
    caminho_saida.write_text(html_final, encoding="utf-8")
    print(f"Estudo salvo em {caminho_saida}")

    atualizar_index(item, f"estudos/{nome_arquivo}")

    item["gerado"] = True
    item["arquivo"] = f"estudos/{nome_arquivo}"
    salvar_temas(temas)

    print("Concluído.")


if __name__ == "__main__":
    main()
