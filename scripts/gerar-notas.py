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
marc = troca(marc, '<div role="group" aria-label="Tema"', '''<nav aria-label="Áreas do Painel" style="display: flex; flex-wrap: wrap; align-items: center; gap: 0 4px; font-size: 14px">
            <template data-sc="for" list="{{menuSite}}" as="ms"><a href="{{ms.href}}" style="color: inherit; text-decoration: none; padding: 8px 10px; min-height: 36px; display: inline-flex; align-items: center; border-radius: 8px; font-weight: {{ms.peso}}">{{ms.txt}}</a></template>
          </nav>
          <template data-sc="if" value="{{temUsuario}}"><span style="font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px">{{usuarioNome}}
            <button type="button" onClick="{{sair}}" style="font: inherit; font-size: 13px; color: inherit; background: none; border: 1px solid {{tTopoLinha}}; border-radius: 999px; padding: 4px 12px; cursor: pointer">Sair</button></span></template>
          <div role="group" aria-label="Tema"''')

js = troca(js, "intervalo: 'quad', meses: [24321], quads: ['2026-3']", "intervalo: 'mensal', meses: [REAL.atual], quads: [REAL.quadAtual]")
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
      coletaTxt: REAL.ultima ? 'Dados do PEC e-SUS · coleta de ' + REAL.ultima : 'Dados do PEC e-SUS',
      menuSite: MENU_SITE(), temUsuario: !!USUARIO, usuarioNome: USUARIO ? USUARIO.nome.split(' ')[0] : '',
      sair: async () => { try { await fetch('/api/v1/auth/sair', { method: 'POST', credentials: 'same-origin' }); } finally { location.replace('/entrar'); } },""")
helm = helm.replace('family=Montserrat:wght@400;500;600;700;800&amp;', '')


pagina = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notas metodológicas · Painel APS</title>
<link rel="icon" href="/img/painelaps.svg" type="image/svg+xml">
{helm.strip()}
<style>#aviso{{font:16px/1.5 'Source Sans 3','Segoe UI',system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#14212B}}#aviso a{{color:#0E5E8C}}</style>
</head>
<body>
<!-- Gerado por scripts/gerar-notas.py a partir de desenho/Notas.dc.html. Não edite à mão. -->
<div id="tela"><p id="aviso">Carregando os indicadores coletados…</p></div>
<template id="modelo">{marc}</template>
<script src="/js/dc-mini.js"></script>
<script src="/js/catalogo-indicadores.js"></script>
<script src="/js/notas-real.js"></script>
<script>
let REAL = null, USUARIO = null;
const MENU_SITE = () => [['/', 'Acompanhamentos'], ['/composicao', 'Composição']].concat(USUARIO && (USUARIO.perfil === 'admin' || USUARIO.perfil === 'gestor') ? [['/filas', 'Filas e faltas'], ['/lancamentos', 'Lançamentos']] : []).map(([href, txt]) => ({{ href, txt, peso: 600 }}));
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
  }} catch (e) {{ aviso('Não foi possível carregar os indicadores. Recarregue a página.'); }}
}})();
</script>
</body>
</html>
'''
(R / 'painel/notas.html').write_text(pagina)
print('painel/notas.html', len(pagina))
