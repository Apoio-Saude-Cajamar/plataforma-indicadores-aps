// Painel APS · relatório (documento, tela e emissão). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
// ---------- documento ----------
const mesLong = (c) => {
  const [a, m] = c.split('-');
  return (
    ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1] +
    ' de ' +
    a
  );
};
// Período de referência da competência: o mês inteiro e o quadrimestre do cofinanciamento federal.
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function periodoRef(c) {
  const [a, m] = c.split('-').map(Number);
  const ult = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const q = Math.ceil(m / 4);
  return {
    mes: '01/' + String(m).padStart(2, '0') + '/' + a + ' a ' + ult + '/' + String(m).padStart(2, '0') + '/' + a,
    quadrimestre: q + 'º quadrimestre de ' + a + ' (' + MESES_CURTOS[(q - 1) * 4] + ' a ' + MESES_CURTOS[q * 4 - 1] + ')',
  };
}
// Datas em que os dados desta competência foram coletados do PEC (primeira e última etapa usada).
function datasColeta(comp) {
  const ds = [...(dados[comp] || []), ...(ABS[comp] || [])]
    .map((l) => l.coletadoEm)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d))
    .sort((x, y) => x - y);
  if (!ds.length) return '—';
  const f = (d) => d.toLocaleDateString('pt-BR');
  return f(ds[0]) === f(ds[ds.length - 1]) ? f(ds[0]) : f(ds[0]) + ' a ' + f(ds[ds.length - 1]);
}
const SELAG = { unidades: new Set(), equipes: new Set() };
function montarSelAg() {
  const comp = $('comp').value,
    ab = $('ab').value,
    el = $('selAg');
  el.hidden = !($('tipo').value === 'agrupado' && ab !== 'municipio');
  if (el.hidden) return;
  painelSel(el, itensSel(comp, ab), SELAG[ab], () => {
    SELAG[ab] = new Set(marcadosDe(el));
    desenhar();
  });
}
function escoposDaTela(tipo, comp, un) {
  if (tipo === 'unidades') {
    const us = un ? [un] : unidadesDe(comp);
    return { lista: us.map((u) => escUnidade(comp, u)), abr: un || 'Todas as unidades, uma a uma' };
  }
  if (tipo === 'equipes') {
    let l = equipesDe(comp, un);
    const eq = $('eq').value;
    if (eq) l = l.filter((x) => x.u + '|' + x.e === eq);
    return { lista: l.map(escEquipe), abr: (un || 'Todas as unidades') + (eq ? ' · equipe selecionada' : ' · todas as equipes') };
  }
  const ab = $('ab').value;
  if (ab === 'municipio') return { lista: [escMunicipio()], abr: 'Município (consolidado)' };
  const sel = [...SELAG[ab]];
  if (ab === 'unidades') {
    const us = unidadesDe(comp).filter((u) => sel.includes(u));
    return { lista: us.length ? [escUnidades(us)] : [], abr: us.length + ' unidade(s), consolidado' };
  }
  const ts = equipesDe(comp, '').filter((t) => sel.includes(t.u + '|' + t.e));
  return { lista: ts.length ? [escEquipes(ts)] : [], abr: ts.length + ' equipe(s), consolidado' };
}
function moldura(tipo, comp, abr, corpo) {
  const quando = new Date();
  const id =
    'PAPS-' + comp.replace('-', '') + '-' + tipo.slice(0, 3).toUpperCase() + '-' + quando.toISOString().slice(0, 16).replace(/\D/g, '');
  $('doc').innerHTML =
    '<div class="capa"><img src="/img/painelaps.svg" alt=""><div><div class="org">Painel APS · Secretaria de Saúde de Cajamar</div><h1>' +
    esc(TITULOS[tipo]) +
    '</h1></div></div>' +
    '<dl class="meta"><div><dt>Competência</dt><dd>' +
    esc(mesLong(comp)) +
    '</dd></div><div><dt>Período de referência</dt><dd>' +
    esc(periodoRef(comp).mes) +
    '<br>' +
    esc(periodoRef(comp).quadrimestre) +
    '</dd></div><div><dt>Dados coletados do PEC em</dt><dd>' +
    esc(datasColeta(comp)) +
    '</dd></div><div><dt>Abrangência</dt><dd>' +
    esc(abr) +
    '</dd></div>' +
    '<div><dt>Emitido por</dt><dd>' +
    esc(USUARIO ? USUARIO.nome : '—') +
    (USUARIO ? ' (' + (PERFIL[USUARIO.perfil] || USUARIO.perfil) + ')' : '') +
    '</dd></div>' +
    '<div><dt>Emitido em</dt><dd>' +
    quando.toLocaleDateString('pt-BR') +
    ' às ' +
    quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
    '</dd></div>' +
    '<div><dt>Código do documento</dt><dd>' +
    id +
    '</dd></div><div><dt>Fonte</dt><dd>PEC e-SUS APS (coleta pela extensão) e lançamentos oficiais</dd></div></dl>' +
    corpo +
    '<div class="rodadoc"><b>Como ler este documento.</b> Os números são totais coletados do PEC e-SUS e calculados pelo Painel APS conforme as notas técnicas e as deliberações citadas; são uma prévia para acompanhamento, e o resultado oficial é o do Ministério da Saúde e da Secretaria de Estado da Saúde. Os indicadores de produção (atendimentos, procedimentos e atividades) contam o período de referência; os de acompanhamento de pessoas (por exemplo, C2 a C7 e CVAT) contam a janela da nota (em geral 12 meses) terminando no último dia da competência, sobre as pessoas vinculadas no dia da coleta. Valores marcados com ≈ são aproximados e “piso” indica que o valor real é igual ou maior. A explicação de cada coleta e de cada cálculo está em Como coletamos e calculamos (rodapé do Painel). Este documento não contém dados de pacientes.</div>';
  document.title = 'Relatório · ' + TITULOS[tipo] + ' · ' + comp;
}

function desenhar() {
  const tipo = $('tipo').value,
    comp = $('comp').value,
    un = $('un').value;
  $('pagina').textContent = '@page{size:A4 ' + ($('orient').value === 'paisagem' ? 'landscape' : 'portrait') + '}';
  $('lbParcela').hidden = !(tipo === 'estadual' || tipo === 'completo' || tipo === 'geral');
  $('lbUn').hidden = tipo === 'estadual' || tipo === 'agrupado';
  $('lbEq').hidden = tipo !== 'equipes';
  $('lbAb').hidden = tipo !== 'agrupado';
  if (tipo === 'equipes') {
    const atual = $('eq').value;
    const l = equipesDe(comp, un);
    $('eq').innerHTML =
      '<option value="">Todas (' +
      l.length +
      ')</option>' +
      l.map((x) => '<option value="' + esc(x.u + '|' + x.e) + '">' + esc(x.u + ' · ' + x.e) + '</option>').join('');
    $('eq').value = l.some((x) => x.u + '|' + x.e === atual) ? atual : '';
  }
  $('selAg').hidden = !(tipo === 'agrupado' && $('ab').value !== 'municipio');
  if (!comp) {
    $('doc').innerHTML = '<p class="vazio">Ainda não há competências coletadas.</p>';
    return;
  }
  let corpo = '',
    abr = un || 'Município e todas as unidades';
  if (tipo === 'geral') corpo = secGeral(comp, un);
  if (tipo === 'federal' || tipo === 'completo') corpo += (tipo === 'completo' ? secGeral(comp, un) : '') + secFederal(comp, un);
  if (tipo === 'regua' || tipo === 'completo') corpo += secRegua(comp, un);
  if (tipo === 'unidades' || tipo === 'equipes' || tipo === 'agrupado') {
    const r = escoposDaTela(tipo, comp, un);
    abr = r.abr;
    corpo += r.lista.length
      ? secEscopos(comp, r.lista, INTRO_ESC + (r.lista[0].lista ? ' <b>Consolidado:</b> ' + esc(r.lista[0].lista) + '.' : ''))
      : '<h2>Relatório</h2><p class="vazio">' +
        (tipo === 'agrupado' ? 'Marque ao menos uma unidade ou equipe na lista acima.' : 'Sem dados nesta competência.') +
        '</p>';
  }
  if (tipo === 'estadual' || tipo === 'completo') corpo += secEstadual();
  if (tipo === 'municipal' || tipo === 'completo') corpo += secMunicipal(comp, un);
  if (tipo === 'absenteismo' || tipo === 'completo') corpo += secAbsenteismo(comp, un);
  moldura(tipo, comp, tipo === 'estadual' ? 'Município' : abr, corpo);
}
async function carregarComp(comp) {
  if (!comp) return;
  if (!dados[comp]) {
    try {
      const d = await fetch('/api/v1/dados?competencia=' + comp, { credentials: 'same-origin' });
      if (d.ok) {
        const j = await d.json();
        dados[comp] = j.indicadores || [];
        ABS[comp] = j.absenteismo || [];
      }
    } catch (_) {}
  }
  const uns = [...new Set((dados[comp] || []).map((l) => l.unidade).filter((u) => u && u !== 'Município'))].sort();
  const atual = $('un').value;
  $('un').innerHTML = '<option value="">Todas</option>' + uns.map((u) => '<option>' + esc(u) + '</option>').join('');
  $('un').value = uns.includes(atual) ? atual : '';
  FILAS = null;
  if (ehGestor()) {
    try {
      const r = await fetch('/api/v1/filas?competencia=' + comp, { credentials: 'same-origin' });
      if (r.ok) FILAS = await r.json();
    } catch (_) {}
  }
}
function csv() {
  const linhas = [];
  const lim = (s) => '"' + String(s).replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"';
  linhas.push([lim($('doc').querySelector('h1').textContent)].join(';'));
  linhas.push(['Competência', lim($('comp').value)].join(';'));
  linhas.push(['Período de referência', lim(periodoRef($('comp').value).mes), lim(periodoRef($('comp').value).quadrimestre)].join(';'));
  linhas.push(['Dados coletados do PEC em', lim(datasColeta($('comp').value))].join(';'));
  $('doc')
    .querySelectorAll('h2,h3,table.csv')
    .forEach((el) => {
      if (el.tagName === 'TABLE')
        el.querySelectorAll('tr').forEach((tr) => linhas.push([...tr.children].map((c) => lim(c.textContent)).join(';')));
      else {
        linhas.push('');
        linhas.push(lim(el.textContent));
      }
    });
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'painel-aps-' + $('tipo').value + '-' + $('comp').value + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function registrar(acao, tipo, detalhe) {
  try {
    fetch('/api/v1/relatorios/emissao', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo: tipo || $('tipo').value,
        competencia: $('comp').value,
        formato: acao,
        unidade: detalhe !== undefined ? detalhe : $('un').value || null,
      }),
    });
  } catch (_) {}
}
async function iniciar() {
  const q = new URLSearchParams(location.search);
  try {
    const e = await fetch('/api/v1/auth/eu', { credentials: 'same-origin' });
    if (e.ok) USUARIO = (await e.json()).usuario || null;
  } catch (_) {}
  if (!ehGestor()) $('tipo').querySelector('option[value=absenteismo]').textContent = 'Absenteísmo (sem filas por equipe)';
  try {
    const r = await fetch('/api/v1/competencias', { credentials: 'same-origin' });
    if (r.status === 401) {
      location.replace('/entrar');
      return;
    }
    COMPS = ((await r.json()).competencias || [])
      .map((c) => c.competencia)
      .sort()
      .reverse();
  } catch (_) {}
  $('comp').innerHTML = COMPS.map((c) => '<option value="' + c + '">' + mesLong(c) + '</option>').join('');
  const t = q.get('tipo');
  if (t && [...$('tipo').options].some((o) => o.value === t)) $('tipo').value = t;
  if (q.get('competencia') && COMPS.includes(q.get('competencia'))) $('comp').value = q.get('competencia');
  $('parcela').innerHTML = PARCELAS.map((P, i) => '<option value="' + i + '">' + P.n + '</option>').join('');
  $('parcela').value = '2';
  try {
    const [a, b, v] = await Promise.all([
      fetch('/api/v1/estadual/lancamentos', { credentials: 'same-origin' }),
      fetch('/api/v1/composicao', { credentials: 'same-origin' }),
      fetch('/api/v1/vacinas-pec', { credentials: 'same-origin' }),
    ]);
    if (v.ok) VAC = (await v.json()).doses || [];
    if (a.ok) {
      LANC = (await a.json()).vigentes;
      ERRO = false;
    } else ERRO = true;
    if (b.ok) {
      const c = (await b.json()).composicao;
      NESF = c ? (c.unidades || []).reduce((t, u) => t + (u.equipes || []).filter((e) => e.tipo === 'ESF').length, 0) : null;
    }
    // parcela padrão: a mais recente com algum lançamento
    for (let i = PARCELAS.length - 1; i >= 0; i--) {
      if (LANC.some((l) => l.periodo === PARCELAS[i].p)) {
        parcela = PARCELAS[i];
        $('parcela').value = String(i);
        break;
      }
    }
  } catch (_) {
    ERRO = true;
  }
  await carregarComp($('comp').value);
  montarSelAg();
  desenhar();
  $('tipo').onchange = () => {
    $('eq').value = '';
    montarSelAg();
    desenhar();
  };
  $('ab').onchange = () => {
    montarSelAg();
    desenhar();
  };
  $('eq').onchange = () => desenhar();
  $('orient').onchange = () => desenhar();
  $('un').onchange = () => {
    $('eq').value = '';
    desenhar();
  };
  $('comp').onchange = async () => {
    await carregarComp($('comp').value);
    SELAG.unidades.clear();
    SELAG.equipes.clear();
    montarSelAg();
    desenhar();
  };
  $('parcela').onchange = () => {
    parcela = PARCELAS[+$('parcela').value];
    desenhar();
  };
  $('imprimir').onclick = () => {
    registrar('pdf');
    window.print();
  };
  $('csv').onclick = () => {
    registrar('csv');
    csv();
  };
  // Lote: gera o PDF sem mostrar o resultado na tela; depois da impressão a tela volta ao que estava.
  const modo = () => document.querySelector('#fdlg [name=modo]:checked').value;
  const SELLOTE = { unidades: new Set(), equipes: new Set() };
  const montarLote = () => {
    const m = modo(),
      el = $('selLote');
    el.hidden = m === 'todos';
    $('erroLote').textContent = '';
    if (m === 'todos') return;
    painelSel(el, itensSel($('comp').value, m), SELLOTE[m], () => {
      SELLOTE[m] = new Set(marcadosDe(el));
    });
  };
  $('lote').onclick = () => {
    const c = $('comp').value;
    SELLOTE.unidades = new Set(unidadesDe(c));
    SELLOTE.equipes = new Set(equipesDe(c, '').map((t) => t.u + '|' + t.e));
    montarLote();
    $('dlg').showModal();
  };
  document.querySelectorAll('#fdlg [name=modo]').forEach((r) => (r.onchange = montarLote));
  $('cancLote').onclick = () => $('dlg').close();
  $('geraLote').onclick = () => {
    const comp = $('comp').value,
      m = modo(),
      sel = m === 'todos' ? [] : marcadosDe($('selLote'));
    const lista = listaLote(comp, m, sel, $('comMun').checked);
    if (!lista.length) {
      $('erroLote').textContent = 'Marque ao menos um item para gerar o PDF.';
      return;
    }
    $('dlg').close();
    $('pagina').textContent = '@page{size:A4 ' + ($('orient').value === 'paisagem' ? 'landscape' : 'portrait') + '}';
    const abr =
      {
        todos: 'Município, todas as unidades e equipes (individuais)',
        unidades: sel.length + ' unidade(s), individuais',
        equipes: sel.length + ' equipe(s), individuais',
      }[m] +
      ' · ' +
      lista.length +
      ' dossiê(s)';
    moldura('lote', comp, abr, secEscopos(comp, lista, INTRO_ESC));
    registrar('pdf', 'lote', (m + ' · ' + lista.length + ' dossiês').slice(0, 80));
    window.addEventListener('afterprint', () => desenhar(), { once: true });
    setTimeout(() => window.print(), 150);
  };
}
iniciar();
