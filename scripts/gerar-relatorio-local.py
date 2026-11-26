#!/usr/bin/env python3
"""Gera painel/relatorio-local.html: o emissor de relatórios (/relatorio) num arquivo só, que funciona sem o Painel.

Lê os arquivos JSON exportados pela extensão (Histórico → Exportar JSON, um por mês) direto no navegador e responde às
chamadas da API que o relatório faz (/api/v1/...) com esses dados. Os scripts e estilos do relatório entram inteiros no
arquivo, sem mudanças: o documento sai igual ao emitido no Painel. Nada é enviado para fora do computador.
Uso: python3 scripts/gerar-relatorio-local.py
"""
import base64, pathlib, re

R = pathlib.Path(__file__).resolve().parent.parent
P = R / 'painel'
html = (P / 'relatorio.html').read_text()


def arquivo(caminho):
    return (P / caminho.lstrip('/')).read_text()


# Fora: manifesto/ícones do app, barra do celular e sessão (dependem do Painel no ar).
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = re.sub(r'\s*<meta name="(theme-color|mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>', '', html)
html = re.sub(r'\s*<script src="/js/publico/mobile\.js" defer></script>', '', html)
html = re.sub(r'\s*<script src="/js/sessao\.js"></script>', '', html)
html = re.sub(r'\s*<link rel="stylesheet" href="/css/mobile\.css" />', '', html)

# Estilos e scripts do Painel embutidos.
html = re.sub(r'<link rel="stylesheet" href="(/css/[^"]+)" />', lambda m: '<style>\n' + arquivo(m.group(1)) + '\n</style>', html)
html = re.sub(r'<script src="(/js/[^"]+)"></script>', lambda m: '<script>\n' + arquivo(m.group(1)).replace('</script', '<\\/script') + '\n</script>', html)

# Logo embutido (o arquivo abre sem internet e fora do Painel); relatorio.js também o usa no cabeçalho do documento.
logo = 'data:image/svg+xml;base64,' + base64.b64encode((P / 'img/painelaps.svg').read_bytes()).decode()
html = html.replace('/img/painelaps.svg', logo)
# O link da marca leva ao Painel no ar (aberto do computador, "/" seria a raiz do disco).
html = html.replace('<a class="marca" href="/">', '<a class="marca" href="https://painelaps.pages.dev/">')

FONTE = r"""<script>
// Fonte local: responde às chamadas da API do relatório com os arquivos exportados pela extensão. Os arquivos são lidos
// só neste navegador; nada sai do computador.
(function () {
  const ARQ = { porComp: {}, composicao: null };
  let liberar;
  const prontos = new Promise((r) => (liberar = r));
  window.FONTE_LOCAL = { ARQ, liberar: () => liberar() };
  const orig = window.fetch ? window.fetch.bind(window) : null;
  const resp = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  // Mesmas regras do Painel (api/vigente.js): atenção domiciliar não conta; a C1 é só de equipe de verdade (fora "Sem
  // equipe", "INE não encontrado" e Consultório na Rua).
  const fora = (e) => / EMAD | EMAP | SA.*DE EM CASA | MELHOR EM CASA /.test(' ' + String(e || '').toUpperCase() + ' ');
  const contaC1 = (e) => !/SEM EQUIPE|^INE N.*ENCONTRADO|CONSULT.*RIO.*RUA/.test(String(e || '').toUpperCase());
  window.fetch = async (url, opcoes) => {
    const u = new URL(String(url), 'http://local/');
    if (!u.pathname.startsWith('/api/v1/')) return orig ? orig(url, opcoes) : resp({}, 404);
    const p = u.pathname.slice(7);
    await prontos;
    // "Emitido por": o nome digitado na carga (o perfil aparece como "emissão fora do Painel").
    if (p === '/auth/eu') return resp({ usuario: { nome: window.FONTE_LOCAL.nome || 'Não identificado', perfil: 'gestor', origem: 'local' } });
    const comps = Object.keys(ARQ.porComp).sort().reverse();
    if (p === '/competencias') return resp({ competencias: comps.map((c) => ({ competencia: c, coletas: 1, ultimaColetaEm: ARQ.porComp[c].quando })) });
    if (p === '/dados') {
      const c = ARQ.porComp[u.searchParams.get('competencia')];
      return resp({ competencia: u.searchParams.get('competencia'), indicadores: c ? c.indicadores : [], atendimentos: c ? c.atendimentos : [], absenteismo: c ? c.absenteismo : [], escuta: [] });
    }
    if (p === '/composicao') return resp({ composicao: ARQ.composicao });
    if (p === '/estadual/lancamentos') return resp({ vigentes: [] });
    if (p === '/vacinas-pec') return resp({ doses: [] });
    if (p === '/filas') return resp({ competencias: [], profissionais: [], horarios: [] });
    if (p === '/relatorios/emissao') return resp({ ok: true, local: true });
    return resp({ erro: 'Não disponível fora do Painel.' }, 404);
  };
  // Arquivo exportado pela extensão → o que ela manda ao Painel (as linhas de cada equipe, como no envio da coleta).
  // As linhas lidas do PEC vêm inteiras do arquivo ("linhas"); as calculadas na extensão (C1, Q14.2.1, B1 a B6, M2 e
  // atividades coletivas) vêm do resumo por equipe ("indicadores"). C7 e CVAT o Painel calcula pelos itens, como lá.
  const CAMPOS = ['codigo', 'recorte', 'unidade', 'unidadeCnes', 'equipe', 'ine', 'tipoEquipe', 'numerador', 'denominador', 'somaPontos', 'valor', 'excluidos', 'itens'];
  const DE_HOJE = ['Q12.2', 'VINC6A12']; // coleta retroativa: o que só vale para o dia de hoje não vai ao Painel
  window.FONTE_LOCAL.converter = function (j) {
    const tipos = new Map();
    for (const l of j.linhas || []) {
      const k = l.unidade + '|' + l.equipe;
      if (!tipos.has(k) && (l.ine || l.tipoEquipe)) tipos.set(k, { ine: l.ine || null, tipo: l.tipoEquipe || null, cnes: l.unidadeCnes || null });
    }
    for (const e of (j.cubos && j.cubos.equipes) || []) {
      const k = e.unidade + '|' + e.nome;
      if (!tipos.has(k)) tipos.set(k, { ine: e.ine || null, tipo: e.tipo || null, cnes: null });
    }
    const quando = j.iniciadoEm || j.concluidoEm || '';
    const lidos = new Set((j.linhas || []).map((l) => l.codigo));
    const calculadas = (j.indicadores || [])
      .filter((x) => x.nivel === 'equipe' && !lidos.has(x.codigo) && x.codigo !== 'C7' && x.codigo !== 'CVAT')
      .map((x) => {
        const t = tipos.get(x.unidade + '|' + x.equipe) || {};
        return Object.assign({}, x, { ine: t.ine || null, tipoEquipe: t.tipo || null, unidadeCnes: t.cnes || null });
      });
    const linhas = [...(j.linhas || []), ...calculadas]
      .filter((l) => !(j.retroComData && DE_HOJE.includes(l.codigo)))
      .map((l) => {
        const o = { coletadoEm: quando, coletaId: j.id || null };
        for (const c of CAMPOS) o[c] = l[c] ?? null;
        o.recorte = l.recorte || 'situacao';
        o.unidade = l.unidade || 'Município';
        o.equipe = l.equipe || 'Município';
        return o;
      })
      .filter((l) => !fora(l.equipe) && (l.codigo !== 'C1' || contaC1(l.equipe)));
    const cubo = (n) => (j.cubos && Array.isArray(j.cubos[n]) && j.cubos[n].length ? j.cubos[n] : null);
    return { competencia: j.competencia, quando, linhas, atendimentos: cubo('atendimentos'), absenteismo: cubo('absenteismo'), composicao: j.composicao || null };
  };
  // Vários arquivos do mesmo mês: vale, por indicador e equipe (pelo INE ou unidade e nome), a linha da coleta mais
  // recente, como no Painel; faltas e atendimentos vêm da coleta mais recente que os leu.
  window.FONTE_LOCAL.juntar = function (coletas) {
    const cs = [...coletas].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    const vistos = new Set();
    const indicadores = [];
    for (const c of cs)
      for (const l of c.linhas) {
        const k = l.codigo + '|' + l.recorte + '|' + (l.ine ? 'ine:' + l.ine : l.unidade + '|' + l.equipe);
        if (vistos.has(k)) continue;
        vistos.add(k);
        indicadores.push(Object.assign({}, l, { unidade: /^M[12]$/.test(l.codigo) ? 'Município' : l.unidade }));
      }
    const cubo = (n) => ((cs.find((c) => c[n]) || {})[n] || []).filter((x) => !fora(x.equipe));
    return { quando: cs[0].quando, indicadores, atendimentos: cubo('atendimentos'), absenteismo: cubo('absenteismo') };
  };
})();
</script>"""

CARGA = r"""
      <section class="fonte-local" id="fonteLocal" aria-labelledby="flTit">
        <h2 id="flTit">Emissão fora do Painel</h2>
        <p>Escolha os arquivos <b>JSON</b> exportados pela extensão (Histórico da coleta → <b>Exportar JSON</b>), um por mês. Eles são lidos só neste navegador: nada é enviado.
          Lançamentos estaduais, vacinas e filas não vêm nesses arquivos; essas partes saem sem dados.</p>
        <label class="fl-zona" id="flZona">
          <input type="file" id="flArquivos" accept=".json,application/json" multiple />
          <span>Arraste os arquivos para cá ou <u>toque para escolher</u></span>
        </label>
        <ul id="flLista"></ul>
        <label class="fl-nome">Seu nome (sai em “Emitido por”)<input id="flNome" type="text" autocomplete="name" maxlength="80" /></label>
        <p id="flErro" role="alert"></p>
        <button class="btn" id="flMontar" type="button" disabled>Montar o relatório</button>
        <button class="btn sec" id="flTrocar" type="button" hidden>Trocar os arquivos</button>
      </section>
""" + '      <div class="ferr"'

ESTILO = """<style>
.fonte-local{max-width:1100px;margin:16px auto 20px;padding:18px 20px;border:2px solid #d5dce8;border-radius:14px;background:#fff;font-family:Montserrat,system-ui,sans-serif}
.fonte-local h2{margin:0 0 6px;font-size:18px;color:#1f3c72}.fonte-local p{margin:0 0 12px;font-size:14px;line-height:1.5;color:#33414c}
.fl-zona{display:flex;align-items:center;justify-content:center;min-height:88px;padding:12px;border:2px dashed #9fb3c8;border-radius:12px;cursor:pointer;text-align:center;font-weight:600;color:#1f3c72}
.fl-zona.sobre{background:#e3f0f9}.fl-zona input{position:absolute;width:1px;height:1px;opacity:0}
#flLista{margin:12px 0;padding-left:18px;font-size:14px}#flErro{color:#8a1b2a;font-weight:700}
.fl-nome{display:flex;flex-direction:column;gap:4px;max-width:420px;margin:0 0 14px;font-size:12px;font-weight:700;color:#4a5670;text-transform:uppercase;letter-spacing:.04em}
.fl-nome input{font:inherit;font-size:15px;font-weight:600;text-transform:none;letter-spacing:0;min-height:42px;padding:0 12px;border:2px solid #d5dce8;border-radius:10px;background:#fff;color:#1b2340}
.fonte-local.carregado .fl-zona,.fonte-local.carregado #flMontar,.fonte-local.carregado .fl-nome{display:none}
html[data-tema='escuro'] .fonte-local{background:#1a2531;border-color:#2c3a48}
html[data-tema='escuro'] .fonte-local h2,html[data-tema='escuro'] .fl-zona{color:#e6edf3}
html[data-tema='escuro'] .fonte-local p,html[data-tema='escuro'] #flLista,html[data-tema='escuro'] .fl-nome{color:#a7b4c0}
html[data-tema='escuro'] .fl-zona{border-color:#4a5d70}html[data-tema='escuro'] .fl-zona.sobre{background:#22344a}
html[data-tema='escuro'] .fl-nome input{background:#0e151c;border-color:#2c3a48;color:#e6edf3}
html[data-tema='escuro'] #flErro{color:#ff9aa8}
body.sem-dados .ferr,body.sem-dados #doc,body.sem-dados .dica{display:none}
@media (max-width:599px){main{padding:16px}.fonte-local{margin-top:0;padding:16px}.ferr label{flex:1 1 100%}.ferr select{min-width:0;width:100%}.ferr .acoes{margin-left:0}}
@media print{.fonte-local{display:none}}
</style>"""

MONTAGEM = r"""<script>
(function () {
  const $ = (id) => document.getElementById(id);
  document.body.classList.add('sem-dados');
  const lidos = {};
  const mesNome = (c) => { const [a, m] = c.split('-'); return ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][+m - 1] + ' de ' + a; };
  function listar() {
    const cs = Object.keys(lidos).sort();
    const quando = (q) => (q ? new Date(q).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'data não informada');
    $('flLista').innerHTML = cs
      .map((c) => '<li><b>' + mesNome(c) + '</b> — ' + (lidos[c].length > 1 ? lidos[c].length + ' coletas (' + lidos[c].map((x) => quando(x.quando)).join(', ') + ')' : 'coleta de ' + quando(lidos[c][0].quando)) + '</li>')
      .join('');
    $('flMontar').disabled = !cs.length;
  }
  async function ler(arquivos) {
    $('flErro').textContent = '';
    for (const f of arquivos) {
      try {
        const j = JSON.parse(await f.text());
        if (!j || !/^\d{4}-\d{2}$/.test(j.competencia || '') || !Array.isArray(j.indicadores)) throw new Error('não é um arquivo exportado pela extensão');
        const d = window.FONTE_LOCAL.converter(j);
        const ja = (lidos[d.competencia] = lidos[d.competencia] || []);
        // O mesmo arquivo escolhido duas vezes conta uma vez só.
        if (!ja.some((x) => x.quando === d.quando && x.linhas.length === d.linhas.length)) ja.push(d);
      } catch (e) {
        $('flErro').textContent = f.name + ': ' + e.message + '.';
      }
    }
    listar();
  }
  // O nome fica lembrado só neste navegador, para a próxima emissão.
  try { $('flNome').value = localStorage.getItem('painelaps.local.nome') || ''; } catch (_) {}
  $('flArquivos').addEventListener('change', (e) => ler(e.target.files));
  $('flTrocar').addEventListener('click', () => location.reload());
  const z = $('flZona');
  z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('sobre'); });
  z.addEventListener('dragleave', () => z.classList.remove('sobre'));
  z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('sobre'); ler(e.dataTransfer.files); });
  $('flMontar').addEventListener('click', () => {
    const A = window.FONTE_LOCAL.ARQ;
    window.FONTE_LOCAL.nome = $('flNome').value.trim();
    try { localStorage.setItem('painelaps.local.nome', window.FONTE_LOCAL.nome); } catch (_) {}
    PERFIL.gestor = 'emissão fora do Painel';
    for (const c of Object.keys(lidos)) A.porComp[c] = window.FONTE_LOCAL.juntar(lidos[c]);
    // Composição das equipes: a da coleta mais recente que a trouxe.
    const todas = Object.values(lidos).flat().filter((x) => x.composicao).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    A.composicao = todas.length ? todas[0].composicao : null;
    $('fonteLocal').classList.add('carregado');
    $('flTrocar').hidden = false;
    document.body.classList.remove('sem-dados');
    window.FONTE_LOCAL.liberar();
  });
})();
</script>"""

# Fonte local antes de qualquer script do Painel; a carga de arquivos no topo; a montagem no fim.
html = html.replace('<style id="pagina">', FONTE + '\n    ' + ESTILO + '\n    <style id="pagina">', 1)
assert html.count('<div class="ferr"') == 1
html = html.replace('      <div class="ferr"', CARGA, 1)
html = html.replace('Cada emissão fica registrada no histórico de quem emitiu.', 'Emissão fora do Painel: não fica registrada no histórico do Painel.')
html = html.replace('<title>Relatório · Painel APS</title>', '<title>Relatório (fora do Painel) · Painel APS</title>')
html = html.replace('</body>', MONTAGEM + '\n  </body>', 1)
html = '<!-- Gerado por scripts/gerar-relatorio-local.py a partir de painel/relatorio.html. Não edite à mão. -->\n' + html
(P / 'relatorio-local.html').write_text(html)
print('painel/relatorio-local.html', len(html))
