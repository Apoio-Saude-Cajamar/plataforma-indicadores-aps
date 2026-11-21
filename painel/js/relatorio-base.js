// Painel APS · relatório (estado e utilidades do relatório). Script comum: usa as funções e dados declarados nos outros arquivos relatorio-*.js.
const $ = (id) => document.getElementById(id);
let dados = {},
  ABS = {},
  LANC = [],
  VAC = [],
  NESF = null,
  parcela = PARCELAS[2],
  ERRO = false,
  USUARIO = null,
  FILAS = null,
  COMPS = [];
const Q14 = 19.59;
const TITULOS = {
  geral: 'Visão geral da Atenção Primária',
  federal: 'Cofinanciamento federal · indicadores',
  regua: 'Cofinanciamento federal · gráfico com réguas',
  equipes: 'Relatório por equipe · cofinanciamento federal',
  unidades: 'Relatório por unidade · cofinanciamento federal',
  agrupado: 'Relatório agrupado · cofinanciamento federal',
  lote: 'Relatório em lote · cofinanciamento federal',
  estadual: 'Cofinanciamento estadual · IGM SUS Paulista',
  municipal: 'Acompanhamento municipal',
  absenteismo: 'Absenteísmo e filas',
  completo: 'Relatório completo da Atenção Primária',
};
const PERFIL = { admin: 'administrador', gestor: 'gestor', leitor: 'leitor' };
const num = (v, c = 1) => (v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: c }));
const pct = (v) => (v == null ? '—' : num(v, 1) + '%');
// Mais de uma equipe: quantas em cada classe (a nota é por equipe; o valor ao lado é o agregado).
const kpillDist = (d) =>
  d && d.n > 1
    ? '<small>por equipe:</small> ' +
      ['o', 'b', 's', 'r']
        .filter((k) => d.c[k])
        .map((k) => '<span class="cc k-' + k + '">' + d.c[k] + ' ' + NOMEC[k] + '</span>')
        .join(' ')
    : '';
const kpill = (k) => (k ? '<span class="cc k-' + k + '">' + NOMEC[k] + '</span>' : '');
const ehGestor = () => USUARIO && (USUARIO.perfil === 'admin' || USUARIO.perfil === 'gestor');
const med = (a) => {
  if (!a.length) return null;
  const o = a.slice().sort((x, y) => x - y),
    m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};
