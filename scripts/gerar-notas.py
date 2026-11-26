#!/usr/bin/env python3
"""Gera painel/notas.html a partir do desenho do canvas (desenho/Notas.dc.html),
trocando a camada de valores de exemplo pelos dados reais (painel/js/notas-real.js)."""
import re, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
s = (R / 'desenho/Notas.dc.html').read_text()
marc = s[s.index('<x-dc>') + 6:s.index('</x-dc>')]
helm = marc[marc.index('<helmet>') + 8:marc.index('</helmet>')]
marc = marc[marc.index('</helmet>') + 9:]
js = s[s.index('class Component extends DCLogic'):s.rindex('</script>')]

def troca(txt, a, b, n=1):
    assert txt.count(a) >= 1, 'trecho não encontrado: ' + a[:70]
    return txt.replace(a, b) if n == 0 else txt.replace(a, b, n)

# Marcação: repetição e condição viram <template> (o navegador descarta marcas desconhecidas dentro de <select>).
marc = re.sub(r'<sc-for\b', '<template data-sc="for"', marc)
marc = re.sub(r'<sc-if\b', '<template data-sc="if"', marc)
marc = re.sub(r'</sc-(for|if)>', '</template>', marc)
marc = troca(marc, 'Rascunho · valores fictícios', '{{coletaTxt}}')
# Cabeçalho da página oficial: o selo "APS" volta ao início do Painel e entra o menu do Painel com o usuário.
marc = troca(marc, '<div style="width: 40px; height: 40px; border-radius: 8px; background: {{tSelo}}; color: {{tSeloTexto}}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; letter-spacing: .04em">APS</div>',
  '<a href="/" aria-label="Voltar ao início do Painel APS" style="width: 40px; height: 40px; border-radius: 8px; background: {{tSelo}}; color: {{tSeloTexto}}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; letter-spacing: .04em; text-decoration: none">APS</a>')
# Barra do Painel (a mesma das demais páginas) acima do cabeçalho próprio das notas; o selo "APS" sai, pois a barra já traz o logo.
marc = troca(marc, '  <header style="background: {{tTopoFundo}}', '''  <div id="barra-painel" style="background: #1F3C72; color: #FFFFFF; font-family: 'Montserrat', system-ui, sans-serif">
    <div style="max-width: 1360px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap">
      <a href="/" style="display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 19px; color: #FFFFFF; text-decoration: none"><img src="/img/painelaps.svg" alt="" width="34" height="34"><span>Painel APS</span></a>
      <nav aria-label="Áreas do Painel" style="display: flex; flex-wrap: nowrap; white-space: nowrap; align-items: center; gap: 2px 2px; font-weight: 600; font-size: 13.5px">
        <details style="position: relative"><summary style="color: #FFFFFF; padding: 8px 8px; min-height: 36px; display: inline-flex; align-items: center; border-radius: 99px; cursor: pointer; list-style: none; background: rgba(255,255,255,.22)">Acompanhamentos ▾</summary>
          <div style="position: absolute; z-index: 20; top: 100%; left: 0; min-width: 230px; margin-top: 6px; background: #FFFFFF; border: 2px solid #D5DCE8; border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(20,33,43,.18); display: flex; flex-direction: column">
            <a href="/" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Visão geral</a>
            <a href="/notas" aria-current="page" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap; background: #D9ECF8">Federal</a>
            <a href="/estadual" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Estadual</a>
            <a href="/municipal" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Municipal</a></div></details>
        <template data-sc="for" list="{{menuSite}}" as="ms"><a href="{{ms.href}}" style="color: #FFFFFF; text-decoration: none; padding: 8px 8px; min-height: 36px; display: inline-flex; align-items: center; border-radius: 99px; background: {{ms.fundo}}">{{ms.txt}}</a></template>
        <template data-sc="if" value="{{temLanc}}"><details style="position: relative"><summary style="color: #FFFFFF; padding: 8px 8px; min-height: 36px; display: inline-flex; align-items: center; border-radius: 99px; cursor: pointer; list-style: none">Lançamentos ▾</summary>
          <div style="position: absolute; z-index: 20; top: 100%; left: 0; min-width: 230px; margin-top: 6px; background: #FFFFFF; border: 2px solid #D5DCE8; border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(20,33,43,.18); display: flex; flex-direction: column">
            <a href="/lancamentos" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Metas do PAS</a>
            <a href="/lancamentos-vacinas" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Coberturas vacinais</a>
            <a href="/estadual#t-form" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; white-space: nowrap">Cofinanciamento estadual</a></div></details></template>
      </nav>
      <div role="group" aria-label="Tema" style="display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid rgba(255,255,255,.35); border-radius: 99px"><button type="button" onClick="{{tClaro}}" aria-pressed="{{pClaro}}" title="Tema claro" aria-label="Tema claro" style="all: unset; box-sizing: border-box; width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; cursor: pointer; color: #FFFFFF; opacity: {{pClaroOp}}; background: {{pClaroBg}}"><span aria-hidden="true" style="font-size: 15px; line-height: 1">☀</span></button><button type="button" onClick="{{tPers}}" aria-pressed="{{pPers}}" title="Tema personalizado (cores de Cajamar)" aria-label="Tema personalizado (cores de Cajamar)" style="all: unset; box-sizing: border-box; width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; cursor: pointer; color: #FFFFFF; opacity: {{pPersOp}}; background: {{pPersBg}}"><span aria-hidden="true" style="font-size: 15px; line-height: 1">◐</span></button><button type="button" onClick="{{tEsc}}" aria-pressed="{{pEsc}}" title="Tema escuro" aria-label="Tema escuro" style="all: unset; box-sizing: border-box; width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; cursor: pointer; color: #FFFFFF; opacity: {{pEscOp}}; background: {{pEscBg}}"><span aria-hidden="true" style="font-size: 15px; line-height: 1">☾</span></button></div>
      <template data-sc="if" value="{{temUsuario}}"><details style="position: relative; font-size: 13px; font-weight: 600"><summary style="list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,.6); border-radius: 99px; padding: 4px 12px 4px 4px; min-height: 36px"><span style="width: 26px; height: 26px; border-radius: 50%; background: #00A7E7; display: inline-grid; place-items: center; font-weight: 800">{{usuarioInicial}}</span>{{usuarioNome}} ▾</summary>
        <div style="position: absolute; z-index: 30; right: 0; top: 100%; margin-top: 6px; min-width: 260px; background: #FFFFFF; color: #1B2340; border: 2px solid #D5DCE8; border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(20,33,43,.18); display: flex; flex-direction: column; font-size: 14px">
          <template data-sc="for" list="{{itensUsuario}}" as="iu"><a href="{{iu.href}}" style="color: #1B2340; text-decoration: none; padding: 8px 12px; border-radius: 8px; font-weight: {{iu.peso}}">{{iu.txt}}</a></template>
          <button type="button" onClick="{{sair}}" style="font: inherit; color: #1B2340; background: none; border: 0; border-top: 1px solid #E3E8F0; margin-top: 6px; text-align: left; padding: 10px 12px 8px; cursor: pointer">Sair</button></div></details></template>
    </div>
  </div>
  <nav id="sub-painel" aria-label="Cofinanciamento federal" style="background: #163059; border-bottom: 4px solid #00A7E7; font-family: 'Montserrat', system-ui, sans-serif">
    <div style="max-width: 1280px; margin: 0 auto; padding: 0 24px; display: flex; gap: 28px; font-weight: 600; font-size: 14px">
      <a href="/notas" aria-current="page" style="color: #FFFFFF; text-decoration: none; padding: 10px 0 9px; border-bottom: 3px solid #FFFFFF; margin-bottom: -4px">Dashboard</a>
      <a href="{{linkDados}}" title="Tabelas para conferir os números, no mesmo período e recorte" style="color: rgba(255,255,255,.82); text-decoration: none; padding: 10px 0 9px; border-bottom: 3px solid transparent; margin-bottom: -4px">Dados</a>
    </div>
  </nav>
  <header style="background: {{tTopoFundo}}''')
marc = re.sub(r'<div role="group" aria-label="Tema" style="display: flex; border.*?</template>\s*</div>', '', marc, count=1, flags=re.S)
marc = re.sub(r'<template data-sc="if" value="\{\{temSelo\}\}".*?</template>\s*', '', marc, count=1, flags=re.S)
marc = re.sub(r'<template data-sc="if" value="\{\{temAssinatura\}\}".*?</template>\s*', '', marc, count=1, flags=re.S)

js = troca(js, "intervalo: 'quad', meses: [24321], quads: ['2026-3']", "intervalo: 'mensal', meses: [REAL.atual], quads: [REAL.quadAtual]")
js = troca(js, "    this.state.aplicado = Component.pega(this.state);", "    Object.assign(this.state, CTX_INICIAL());\n    this.state.aplicado = Component.pega(this.state);")
js = troca(js, 'const ATUAL = 2026 * 12 + 9, INICIO = 2025 * 12;', 'const ATUAL = REAL.atual, INICIO = REAL.inicio;')
js = troca(js, 'const lista = [', 'let lista = [')
js = troca(js, '    const N = {};', '    lista = REAL.ajustar(lista);\n    const N = {};')
js = troca(js, "'componente à parte (Nota Técnica nº 6/2025)'", "'componente à parte (Nota Técnica nº 8/2026)'")
js = troca(js, 'Nota Técnica nº 6/2025 do Ministério', 'Nota Técnica nº 8/2026 do Ministério')
a = js.index('    const infoNota = (n) =>'); b = js.index('// ===== INTERVALO')
js = js[:a] + """    const infoNota = (n) => 'Coletado do PEC e-SUS pela extensão. ' + n.fonte + apuraTxt(n) + refNota(n) + (REAL.ultima ? ' Última coleta: ' + REAL.ultima + '.' : '');

    // Unidades, equipes e valores: dados reais da coleta (painel/js/notas-real.js).
    const nomesUn = REAL.unidades;
    const equipesDa = (u) => REAL.equipesDa(u);
    const unidadeTem = (u, nn) => REAL.tem(nn, { u, e: '' });
    const todasEquipes = REAL.todasEquipes();
    const esc = (n) => (n.max - n.min) / 100;
    const corta = (n, x) => +Math.max(n.min, Math.min(n.max, x)).toFixed(n.fmt);
    const pessoas = (cod, u, e) => REAL.pessoas(N[cod], u, e);

    """ + js[b:]
js = troca(js, "const QS = ['2025-1', '2025-2', '2025-3', '2026-1', '2026-2', '2026-3'];", 'const QS = REAL.quads;')
js = troca(js, 'filter((a) => a >= INICIO && a <= ATUAL)', 'filter((a) => REAL.temMes(a))')
js = troca(js, 'feitos = todos.filter((a) => a <= ATUAL)', 'feitos = todos.filter((a) => REAL.temMes(a))')
js = troca(js, "tempoDe(ehQuad, [ATUAL], ['2026-3'])", 'tempoDe(ehQuad, [ATUAL], [REAL.quadAtual])')
js = troca(js, 'const aplica = (nn, l) =>', 'const aplica0 = (nn, l) =>')
js = troca(js, '    const locaisDa = (nn) =>', '    const aplica = (nn, l) => aplica0(nn, l) && REAL.tem(nn, l);\n    const locaisDa = (nn) =>')
a = js.index('    const pesoL = (cod, l) =>'); b = js.index('    // Faixa, ordenação e régua.')
js = js[:a] + "    const vL = (cod, l, ms) => REAL.valor(N[cod], [l], ms);\n    const vG = (cod, ls, ms) => REAL.valor(N[cod], ls, ms);\n\n" + js[b:]
js = troca(js, 'futuro: a > ATUAL, parcial: false', 'futuro: !REAL.temMes(a), parcial: false')
js = troca(js, "equipesDa(u).filter((e) => n.tipos.indexOf(e.tipo) >= 0)", "equipesDa(u).filter((e) => n.tipos.indexOf(e.tipo) >= 0 && REAL.tem(n, { u, e: e.nome }))")
js = troca(js, "a = anoPainel * 12 + k, fut = a > ATUAL;", "a = anoPainel * 12 + k, fut = !REAL.temMes(a);")
js = troca(js, "titulo: fut ? rotMesLongo(a) + ': ainda não fechou'", "titulo: fut ? rotMesLongo(a) + ': sem coleta'")
js = troca(js, ", ['pontos', 'Onde perdemos pontos']", '')
# O (i) mostra também a conta feita, com os totais reais do recorte.
js = troca(js, "infoTxt: infoNota(x.nn),", "infoTxt: infoNota(x.nn) + REAL.calculo(x.nn, x.ls, periodo),")
js = troca(js, "infoListaTxt = infoNota(n);", "infoListaTxt = infoNota(n) + REAL.calculo(n, refLs, periodo);", 1)
js = troca(js, "infoListaTxt = infoNota(n);\n", "infoListaTxt = infoNota(n) + REAL.calculo(n, ls, periodo);\n", 0)
# Temas uniformes: os três usam a mesma letra, os mesmos tamanhos e a mesma estrutura; só as cores mudam.
js = troca(js, "tFonte: \"'Montserrat', 'Segoe UI', system-ui, sans-serif\", tPeso: 500, tTam: '15px', tPesoForte: 700, tPesoTitulo: 800", "tFonte: SANS, tPeso: 400, tTam: '16px', tPesoForte: 700, tPesoTitulo: 700")
js = troca(js, "tTopoBorda: '4px solid #00A7E7'", "tTopoBorda: '1px solid #00A7E7'")
js = troca(js, "subtitulo: 'Prefeitura de Cajamar', selo: false", "subtitulo: 'Cajamar', selo: true")
js = troca(js, "temSelo: selo, temAssinatura: !selo,", """temSelo: selo, temAssinatura: !selo,
      ...(() => { const ch = (id) => () => { try { localStorage.setItem('painelaps.tema', id); } catch (_) {} this.setState({ tema: id }); }; const ps = (id) => tema === id; return { tClaro: ch('claro'), tPers: ch('personalizado'), tEsc: ch('escuro'), pClaro: ps('claro') ? 'true' : 'false', pPers: ps('personalizado') ? 'true' : 'false', pEsc: ps('escuro') ? 'true' : 'false', pClaroOp: ps('claro') ? 1 : .75, pPersOp: ps('personalizado') ? 1 : .75, pEscOp: ps('escuro') ? 1 : .75, pClaroBg: ps('claro') ? 'rgba(255,255,255,.26)' : 'transparent', pPersBg: ps('personalizado') ? 'rgba(255,255,255,.26)' : 'transparent', pEscBg: ps('escuro') ? 'rgba(255,255,255,.26)' : 'transparent' }; })(),
      coletaPre: REAL.ultima ? 'Dados do PEC e-SUS · ' : 'Dados do PEC e-SUS', coletaPreCls: REAL.ultima ? 'so-largo' : '', coletaTxt: REAL.ultima ? 'coleta de ' + REAL.ultima : '',
      linkDados: LINK_DADOS(st),
      menuSite: MENU_SITE(), temLanc: !!USUARIO && (USUARIO.perfil === 'admin' || USUARIO.perfil === 'gestor'), itensUsuario: ITENS_USUARIO(), usuarioInicial: USUARIO ? USUARIO.nome.trim().charAt(0).toUpperCase() : '', temUsuario: !!USUARIO, usuarioNome: USUARIO ? USUARIO.nome.split(' ')[0] : '',
      sair: async () => { try { await fetch('/api/v1/auth/sair', { method: 'POST', credentials: 'same-origin' }); } finally { location.replace('/entrar'); } },""")
# Celular (/css/mobile.css): classes para enxugar o que ocupa espaço (subtítulo, selo da coleta, textos de apoio, rótulos longos),
# resumo numa faixa que rola para o lado e filtros recolhidos numa linha (montados por /js/publico/mobile.js). Computador igual.
marc = troca(marc, '<span style="font-size: 13px; color: {{tTopoSuave}}">Cofinanciamento federal da APS', '<span class="so-largo" style="font-size: 13px; color: {{tTopoSuave}}">Cofinanciamento federal da APS')
marc = troca(marc, '<div style="max-width: 1280px; margin: 0 auto; padding: 14px 24px 0; display: flex; flex-direction: column; gap: 8px">', '<div class="m-cab" style="max-width: 1280px; margin: 0 auto; padding: 14px 24px 0; display: flex; flex-direction: column; gap: 8px">')
marc = troca(marc, 'padding: 3px 10px">{{coletaTxt}}</span>', 'padding: 3px 10px" class="m-selo"><span class="{{coletaPreCls}}">{{coletaPre}}</span>{{coletaTxt}}</span>')
# Filtros que se recolhem (computador e celular): abertos enquanto nada foi escolhido; "Buscar" aplica e recolhe numa linha com o
# resumo do que está valendo (presa no topo); tocar na linha reabre. A troca entre os dois estados é animada (TRANSICAO).
marc = troca(marc, '''  <div style="position: sticky; top: 0; z-index: 3; background: {{tPagina}}; border-bottom: 1px solid {{tBorda}}">
    <div role="search"''', '''  <div class="m-filtros" style="position: {{posFiltros}}; top: 0; z-index: 3; background: {{tPagina}}; border-bottom: 1px solid {{tBorda}}">
    <template data-sc="if" value="{{filtrosAbertos}}">
    <div role="search"''')
marc = troca(marc, '''">Atualizar</button>
    </div>
  </div>

  <main''', '''">Buscar</button></div>
    </div>
    </template>
    <template data-sc="if" value="{{filtrosFechados}}">
    <div class="filtros-resumo" onClick="{{abrirFiltros}}" style="max-width: 1280px; margin: 0 auto; padding: 8px 24px; min-height: 44px; display: flex; align-items: center; gap: 8px 12px; cursor: pointer">
      <button type="button" class="fr-botao" aria-expanded="false" aria-label="Alterar filtros: {{resumoFiltrosTxt}}" style="font: inherit; flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 14px; border: 1px solid {{tControle}}; border-radius: 8px; background: {{tCartao}}; color: {{tTexto}}; font-weight: 600; cursor: pointer"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4Z"/></svg>Filtros<span aria-hidden="true" style="font-size: 11px; color: {{tSuave}}">▾</span></button>
      <div class="fr-chips" aria-hidden="true" style="display: flex; flex-wrap: wrap; gap: 6px; min-width: 0">
        <template data-sc="for" list="{{chipsFiltros}}" as="cf"><span style="font-size: 14px; padding: 5px 12px; border-radius: 999px; background: {{tRealce}}; border: 1px solid {{tDivisa}}; color: {{tTexto}}; white-space: nowrap">{{cf}}</span></template>
      </div>
    </div>
    </template>
  </div>

  <main''')
marc = troca(marc, '<button type="button" onClick="{{atualizar}}" aria-disabled', '<div class="fx-acoes" style="display: flex; align-items: center; gap: 8px; margin-left: auto"><template data-sc="if" value="{{temCancelar}}"><button type="button" onClick="{{cancelarFiltros}}" style="font: inherit; min-height: 44px; padding: 0 14px; border: 0; border-radius: 8px; background: transparent; color: {{tTexto}}; text-decoration: underline; text-underline-offset: 3px; cursor: pointer">Cancelar</button></template>\n      <button type="button" onClick="{{atualizar}}" aria-disabled')
# Seleção aberta: período e recorte à mostra (a grade de meses e a lista de unidades/equipes ficam na tela, sem abrir menus),
# com um título em cada parte; no computador em colunas, no celular uma embaixo da outra (/css/mobile.css).
TIT = '<span class="fx-tit {c}" style="font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: {{{{tSuave}}}}">{t}</span>\n      '
marc = troca(marc, '<div role="group" aria-label="Tipo de intervalo" style="', TIT.format(c='fx-tit-per', t='Período') + '<div role="group" aria-label="Tipo de intervalo" class="fx-intervalo" style="')
marc = troca(marc, '<div role="group" aria-label="Visualização" style="display: flex; margin-left: 14px;', TIT.format(c='fx-tit-rec', t='Recorte') + '<div role="group" aria-label="Visualização" class="fx-visao" style="display: flex; margin-left: 14px;')
marc = re.sub(r'<div style="position: relative">(\s*<button type="button" onClick="\{\{abrirTempo\}\}")', r'<div class="fx-tempo" style="position: relative">\1', marc, count=1)
marc = re.sub(r'<div style="position: relative">(\s*<button type="button" onClick="\{\{abrirLocais\}\}")', r'<div class="fx-locais" style="position: relative">\1', marc, count=1)
marc = troca(marc, '<label title="{{tituloComparar}}" style="', TIT.format(c='fx-tit-comp', t='Comparação') + '<label class="fx-comparar" title="{{tituloComparar}}" style="')
js = troca(js, "painelTempo: painelF === 'tempo',", "painelTempo: painelF === 'tempo' || !!dr.filtrosAbertos,")
js = troca(js, "painelLocais: painelF === 'locais',", "painelLocais: painelF === 'locais' || !!dr.filtrosAbertos,")
js = troca(js, "    Object.assign(this.state, CTX_INICIAL());\n", "    Object.assign(this.state, CTX_INICIAL());\n    this.state.filtrosAbertos = !Object.keys(CTX_INICIAL()).length && !FILTROS_JA();\n    this.state.jaRecolheu = !this.state.filtrosAbertos;\n")
js = troca(js, "podeAtualizar = valido && sujo;", "podeAtualizar = valido && (sujo || !!dr.filtrosAbertos);")
js = troca(js, """      if (!podeAtualizar) return;
      const h = new Date();
      set({ aplicado: Component.pega(this.state), painelF: '', aberta: '', abertas: {}, info: '',
        atualizadoEm: String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') });""", """      if (!podeAtualizar) return;
      const h = new Date();
      FILTROS_JA(true);
      TRANSICAO(() => set({ aplicado: Component.pega(this.state), painelF: '', aberta: '', abertas: {}, info: '', filtrosAbertos: false, jaRecolheu: true,
        atualizadoEm: String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') }));""")
js = troca(js, "      atualizar, atualizarInativo:", """      atualizar,
      filtrosAbertos: !!dr.filtrosAbertos, filtrosFechados: !dr.filtrosAbertos, posFiltros: dr.filtrosAbertos ? 'relative' : 'sticky',
      chipsFiltros: [tp.perTxt, localNome, temComp ? 'comparando com ' + tp.compTxt : ''].filter(Boolean),
      resumoFiltrosTxt: [tp.perTxt, localNome, temComp ? 'comparando com ' + tp.compTxt : ''].filter(Boolean).join(', '),
      temCancelar: !!dr.filtrosAbertos && !!dr.jaRecolheu,
      abrirFiltros: () => { if (window.scrollY > 120) { window.scrollTo({ top: 0, behavior: 'smooth' }); set({ filtrosAbertos: true }); } else TRANSICAO(() => set({ filtrosAbertos: true })); },
      cancelarFiltros: () => TRANSICAO(() => set({ ...Component.pega(aplicado), painelF: '', filtrosAbertos: false })),
      atualizarInativo:""")
marc = troca(marc, '<main style="max-width: 1280px; margin: 0 auto; padding: 24px 24px 48px;', '<main class="m-main" style="max-width: 1280px; margin: 0 auto; padding: 24px 24px 48px;')
marc = troca(marc, '<p style="margin: 0; color: {{tSuave}}">{{descricao}}</p>', '<p class="{{descCls}}" style="margin: 0; color: {{tSuave}}">{{descricao}}</p>')
marc = troca(marc, '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px">', '<div class="m-faixa" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px">')
marc = troca(marc, '<span style="font-size: 14px; color: {{tSuave}}">{{comoLer}}</span>', '<span class="m-recolhe" style="font-size: 14px; color: {{tSuave}}">{{comoLer}}</span>')
marc = troca(marc, '{{rotuloAbrirTodas}}</button>', '<span class="so-largo">{{rotuloAbrirTodas}}</span><span class="so-movel">{{rotuloAbrirTodasCurto}}</span></button>')
marc = troca(marc, '{{rotuloPainel}}</button>', '<span class="so-largo">{{rotuloPainel}}</span><span class="so-movel">{{rotuloPainelCurto}}</span></button>')
js = troca(js, "rotuloAbrirTodas = '', alternarTodas = () => {};", "rotuloAbrirTodas = '', rotuloAbrirTodasCurto = '', alternarTodas = () => {};")
js = troca(js, "rotuloAbrirTodas = todas ? 'Fechar todas as notas' : 'Abrir todas (ver cada ' + (visao === 'unidades' ? 'unidade' : 'equipe') + ')';",
  "rotuloAbrirTodas = todas ? 'Fechar todas as notas' : 'Abrir todas (ver cada ' + (visao === 'unidades' ? 'unidade' : 'equipe') + ')';\n        rotuloAbrirTodasCurto = todas ? 'Fechar todas' : 'Ver ' + (visao === 'unidades' ? 'unidades' : 'equipes');")
js = troca(js, "rotuloAbrirTodas, alternarTodas,", "rotuloAbrirTodas, rotuloAbrirTodasCurto, alternarTodas,")
js = troca(js, "rotuloPainel: 'Escolher notas (' + visiveis.length + ' de ' + lista.length + ')',", "rotuloPainel: 'Escolher notas (' + visiveis.length + ' de ' + lista.length + ')', rotuloPainelCurto: 'Notas ' + visiveis.length + '/' + lista.length,")
js = troca(js, "comoLer, pergunta, descricao, rotuloNome,", "comoLer, pergunta, descricao, descCls: rel === 'geral' ? 'so-largo' : '', rotuloNome,")

helm = helm.replace('family=Montserrat:wght@400;500;600;700;800&amp;', '')
helm += '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800&display=swap">'


pagina = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notas metodológicas · Painel APS</title>
<link rel="icon" href="/img/painelaps.svg" type="image/svg+xml">
{helm.strip()}
<script>(function(){{if(new URLSearchParams(location.search).get('incorporado')==='1')document.documentElement.setAttribute('data-incorporado','1');}})();</script>
<style>html[data-incorporado] #barra-painel,html[data-incorporado] #sub-painel,html[data-incorporado] #rodape-aps{{display:none!important}}html[data-incorporado] body{{background:transparent}}</style>
<style>#aviso{{font:16px/1.5 'Source Sans 3','Segoe UI',system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#14212B}}#aviso a{{color:#0E5E8C}}</style>
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#1F3C72" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Painel APS" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />
    <link rel="stylesheet" href="/css/mobile.css" />
    <link rel="stylesheet" href="/css/carregando.css" />
    <script src="/js/publico/mobile.js" defer></script>
</head>
<body>
<!-- Gerado por scripts/gerar-notas.py a partir de desenho/Notas.dc.html. Não edite à mão. -->
<div id="tela"><div class="carr-tela" role="status" aria-live="polite"><div class="carr-marca"><img src="/img/painelaps.svg" alt="" width="40" height="40"><span>Painel APS</span></div><div class="carr-barras" aria-hidden="true"><i></i><i></i><i></i></div><p id="aviso">Carregando os indicadores coletados…</p></div></div>
<template id="modelo">{marc}</template>
<script src="/js/dc-mini.js"></script>
<script src="/js/catalogo-indicadores.js"></script>
<script src="/js/notas-real.js"></script>
<script src="/js/rodape.js"></script>
<script>
let REAL = null, USUARIO = null;
const ITENS_USUARIO = () => {{
  if (!USUARIO) return [];
  const ls = [['/perfil', 'Meu perfil']];
  if (USUARIO.origem === 'senha') ls.push(['/trocar-senha', 'Trocar senha']);
  ls.push(['/ajuda', 'Ajuda e como ler os indicadores']);
  if (USUARIO.perfil === 'admin') ls.push(['', 'Configurações'], ['/usuarios', 'Usuários'], ['/monitoramento', 'Monitoramento das coletas'], ['/comunicados', 'Comunicados'], ['/publicacao', 'Página pública'], ['/chaves', 'Chaves da extensão'], ['/extensao', 'Extensões do Chrome'], ['/historico', 'Histórico de acessos'], ['/backups', 'Backups']);
  return ls.map(([href, txt]) => ({{ href: href || '#', txt, peso: href ? 600 : 800 }}));
}};
// Mês e recorte entre o Dashboard e os Dados: ?de=AAAA-MM&ate=AAAA-MM&un=unidade&eq=unidade|equipe (o mesmo formato nas duas páginas).
// Troca animada entre filtros abertos e recolhidos (View Transitions do navegador; sem suporte ou com "menos movimento", troca direto).
const TRANSICAO = (fn) => {{
  const menos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || menos) return fn();
  const r = document.documentElement;
  r.classList.add('vt-filtros');
  const t = document.startViewTransition(fn);
  const fim = () => r.classList.remove('vt-filtros');
  t.ready.catch(() => {{}});
  t.finished.then(fim, fim);
}};
// Filtros já escolhidos nesta aba: ao voltar ao dashboard, eles abrem recolhidos.
const FILTROS_JA = (marcar) => {{
  try {{
    if (marcar) sessionStorage.setItem('painelaps.notasFiltros', '1');
    return sessionStorage.getItem('painelaps.notasFiltros') === '1';
  }} catch (_) {{
    return !!marcar;
  }}
}};
const CTX_INICIAL = () => {{
  const q = new URLSearchParams(location.search), o = {{}};
  const num = (c) => (/^\\d{{4}}-\\d{{2}}$/.test(c || '') ? +c.slice(0, 4) * 12 + +c.slice(5, 7) - 1 : null);
  const de = num(q.get('de')), ate = num(q.get('ate')) ?? de;
  if (de !== null && ate !== null) {{
    const ms = [];
    for (let a = Math.min(de, ate); a <= Math.max(de, ate); a++) if (REAL.temMes(a)) ms.push(a);
    if (ms.length) Object.assign(o, {{ intervalo: 'mensal', meses: ms }});
  }}
  const un = q.get('un'), eq = q.get('eq');
  if (eq && eq.indexOf('|') > 0 && REAL.unidades.indexOf(eq.split('|')[0]) >= 0) Object.assign(o, {{ visao: 'equipes', equipes: [eq] }});
  else if (un && REAL.unidades.indexOf(un) >= 0) Object.assign(o, {{ visao: 'unidades', unidades: [un] }});
  return o;
}};
const LINK_DADOS = (st) => {{
  const mes = (a) => Math.floor(a / 12) + '-' + String((a % 12) + 1).padStart(2, '0');
  let ms = st.intervalo === 'quad'
    ? (st.quads || []).flatMap((qd) => {{ const [y, k] = String(qd).split('-').map(Number); return [0, 1, 2, 3].map((i) => y * 12 + (k - 1) * 4 + i); }})
    : (st.meses || []);
  ms = ms.filter((a) => REAL.temMes(a));
  const p = new URLSearchParams();
  if (ms.length) {{ p.set('de', mes(Math.min(...ms))); p.set('ate', mes(Math.max(...ms))); }}
  if (st.visao === 'unidades' && (st.unidades || []).length === 1) p.set('un', st.unidades[0]);
  if (st.visao === 'equipes' && (st.equipes || []).length === 1) {{ p.set('un', st.equipes[0].split('|')[0]); p.set('eq', st.equipes[0]); }}
  const s = p.toString();
  return '/indicadores' + (s ? '?' + s : '');
}};
const MENU_SITE = () => [['/composicao', 'Composição de Usuários'], ['/coleta', 'Como coletamos']].concat(USUARIO && (USUARIO.perfil === 'admin' || USUARIO.perfil === 'gestor') ? [['/filas', 'Filas e faltas'], ['/pendencias', 'Pendências']] : []).map(([href, txt]) => ({{ href, txt, fundo: location.pathname.replace(/\\.html$/, '') === href ? 'rgba(255,255,255,.22)' : 'transparent' }}));
{js}
(async () => {{
  const aviso = (t) => {{ document.getElementById('tela').innerHTML = '<p id="aviso">' + t + ' <a href="/">Voltar ao início</a></p>'; }};
  try {{
    const r = await fetch('/api/v1/competencias', {{ credentials: 'same-origin' }});
    if (r.status === 401) {{ location.replace('/entrar'); return; }}
    if (!r.ok) throw 0;
    const cs = ((await r.json()).competencias || []);
    const porComp = {{}};
    await Promise.all(cs.map(async (c) => {{ const d = await fetch('/api/v1/dados?competencia=' + c.competencia, {{ credentials: 'same-origin' }}); if (d.ok) {{ const ls = (await d.json()).indicadores || []; if (ls.length) porComp[c.competencia] = ls; }} }}));
    if (!Object.keys(porComp).length) {{ aviso('Ainda não há indicadores coletados. Rode a coleta pela extensão no computador que acessa o PEC.'); return; }}
    try {{ const e = await fetch('/api/v1/auth/eu', {{ credentials: 'same-origin' }}); if (e.ok) USUARIO = (await e.json()).usuario || null; }} catch (_) {{}}
    const ult = cs.map((c) => c.ultimaColetaEm).filter(Boolean).sort().pop();
    REAL = montarREAL(porComp, ult ? new Date(ult).toLocaleString('pt-BR', {{ dateStyle: 'short', timeStyle: 'short' }}) : '');
    let tema = ''; try {{ tema = localStorage.getItem('painelaps.tema') || ''; }} catch (e) {{}}
    montarDC(document.getElementById('modelo'), Component, document.getElementById('tela'), {{ tema: tema || 'personalizado' }});
    // Se for aberto dentro de um quadro (?incorporado=1), avisa a página de fora a altura do conteúdo, para o quadro não ter rolagem própria.
    if (window.parent !== window) {{
      const enviar = () => parent.postMessage({{ tipo: 'painelaps:altura', h: document.documentElement.scrollHeight }}, location.origin);
      new ResizeObserver(enviar).observe(document.body);
      enviar();
    }}
  }} catch (e) {{ aviso('Não foi possível carregar os indicadores. Recarregue a página.'); }}
}})();
</script>
</body>
</html>
'''
(R / 'painel/notas.html').write_text(pagina)
print('painel/notas.html', len(pagina))
