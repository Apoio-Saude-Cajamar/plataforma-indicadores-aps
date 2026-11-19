// Valida as consultas GraphQL da extensão contra o esquema .graphqls do PEC (sem dependências).
// Uso: node validar-pec.js <pasta-do-esquema> <pasta-da-extensao>
const fs = require('fs'), path = require('path'), vm = require('vm');
const [dirEsq, dirExt] = process.argv.slice(2);

// ---------- tokenizador comum ----------
function tokens(src) {
  src = src.replace(/"""[\s\S]*?"""/g, ' ').replace(/"(?:\\.|[^"\\])*"/g, ' "S" ').replace(/#[^\n]*/g, ' ');
  return src.match(/\.\.\.|[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|"S"|[{}()\[\]:!=|@$,&]/g) || [];
}

// ---------- esquema ----------
const T = {}; // nome -> { kind, fields: {nome: {type, args:{}}}, values:Set, members:[] }
const escalares = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);
function lerTipo(tk, i) { // devolve [tipoTexto, i]
  let s = '';
  if (tk[i] === '[') { const [t, j] = lerTipo(tk, i + 1); s = '[' + t + ']'; i = j + 1; } else { s = tk[i]; i++; }
  if (tk[i] === '!') { s += '!'; i++; }
  return [s, i];
}
function pularDiretivas(tk, i) {
  while (tk[i] === '@') { i += 2; if (tk[i] === '(') { let d = 1; i++; while (d) { if (tk[i] === '(') d++; if (tk[i] === ')') d--; i++; } } }
  return i;
}
function lerSDL(src) {
  const tk = tokens(src); let i = 0;
  while (i < tk.length) {
    let ext = false;
    if (tk[i] === 'extend') { ext = true; i++; }
    const kw = tk[i];
    if (kw === 'scalar') { escalares.add(tk[i + 1]); i += 2; i = pularDiretivas(tk, i); continue; }
    if (kw === 'schema' || kw === 'directive') {
      // pula até o fim do bloco ou da linha lógica
      if (kw === 'schema') { while (tk[i] !== '{') i++; let d = 0; do { if (tk[i] === '{') d++; if (tk[i] === '}') d--; i++; } while (d); continue; }
      i++; while (i < tk.length && !['type', 'input', 'enum', 'interface', 'union', 'scalar', 'extend', 'directive', 'schema'].includes(tk[i])) i++; continue;
    }
    if (kw === 'union') {
      const nome = tk[i + 1]; i += 2; i = pularDiretivas(tk, i);
      const t = T[nome] || (T[nome] = { kind: 'union', fields: {}, members: [] });
      if (tk[i] === '=') { i++; if (tk[i] === '|') i++; t.members.push(tk[i]); i++; while (tk[i] === '|') { t.members.push(tk[i + 1]); i += 2; } }
      continue;
    }
    if (['type', 'input', 'interface', 'enum'].includes(kw)) {
      const nome = tk[i + 1]; i += 2;
      const t = T[nome] || (T[nome] = { kind: kw, fields: {}, values: new Set(), impl: [] });
      if (tk[i] === 'implements') { i++; while (/^[A-Za-z_]/.test(tk[i]) && tk[i] !== '{') { if (tk[i] !== '&') t.impl.push(tk[i]); i++; if (tk[i] === '&') i++; } }
      i = pularDiretivas(tk, i);
      if (tk[i] !== '{') continue;
      i++;
      while (tk[i] !== '}') {
        if (kw === 'enum') { t.values.add(tk[i]); i++; i = pularDiretivas(tk, i); if (tk[i] === ',') i++; continue; }
        const f = tk[i]; i++; const args = {};
        if (tk[i] === '(') {
          i++;
          while (tk[i] !== ')') { const a = tk[i]; i += 2; const [ty, j] = lerTipo(tk, i); args[a] = ty; i = j;
            if (tk[i] === '=') { i++; if (tk[i] === '[' || tk[i] === '{') { const ab = tk[i], fe = ab === '[' ? ']' : '}'; let d = 0; do { if (tk[i] === ab) d++; if (tk[i] === fe) d--; i++; } while (d); } else i++; }
            i = pularDiretivas(tk, i); if (tk[i] === ',') i++; }
          i++;
        }
        i++; // ':'
        const [ty, j] = lerTipo(tk, i); i = j;
        if (tk[i] === '=') { i++; if (tk[i] === '[' || tk[i] === '{') { const ab = tk[i], fe = ab === '[' ? ']' : '}'; let d = 0; do { if (tk[i] === ab) d++; if (tk[i] === fe) d--; i++; } while (d); } else i++; }
        i = pularDiretivas(tk, i); if (tk[i] === ',') i++;
        t.fields[f] = { type: ty, args };
      }
      i++;
      continue;
    }
    i++;
  }
}
function arquivos(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivos(path.join(d, e.name)) : e.name.endsWith('.graphqls') ? [path.join(d, e.name)] : []); }
arquivos(dirEsq).forEach(f => lerSDL(fs.readFileSync(f, 'utf8')));
const base = t => t.replace(/[\[\]!]/g, '');
const ehLista = t => t.replace(/!$/, '').startsWith('[');
// campos visíveis em um tipo (interfaces e uniões: inclui __typename)
function campo(tipo, nome) {
  if (nome === '__typename') return { type: 'String', args: {} };
  const t = T[tipo]; if (!t) return null;
  return t.fields[nome] || null;
}
function podeSer(tipo, alvo) { // fragmento "... on alvo" dentro de tipo
  if (tipo === alvo) return true;
  const t = T[tipo], a = T[alvo];
  if (!t || !a) return false;
  if (t.kind === 'union') return t.members.includes(alvo) || t.members.some(m => (T[m]?.impl || []).includes(alvo));
  if (t.kind === 'interface') return (a.impl || []).includes(tipo) || Object.values(T).some(x => (x.impl || []).includes(tipo) && (x.impl || []).includes(alvo));
  return (t.impl || []).includes(alvo);
}

// ---------- consultas ----------
function validarOperacao(nome, src) {
  const erros = []; const tk = tokens(src); let i = 0;
  const op = tk[i]; i++;
  const raiz = op === 'mutation' ? 'Mutation' : 'Query';
  if (/^[A-Za-z_]/.test(tk[i]) && tk[i] !== '{') i++;
  const vars = {};
  if (tk[i] === '(') { i++; while (tk[i] !== ')') { i++; const v = tk[i]; i += 2; const [ty, j] = lerTipo(tk, i); vars[v] = ty; i = j; if (tk[i] === '=') i += 2; if (tk[i] === ',') i++; } i++; }
  for (const [v, ty] of Object.entries(vars)) if (!T[base(ty)] && !escalares.has(base(ty))) erros.push(`variável $${v}: tipo ${ty} não existe`);
  const usadas = new Set();
  function valor(i, tipoEsperado, onde) {
    if (tk[i] === '$') { const v = tk[i + 1]; usadas.add(v);
      if (vars[v] && tipoEsperado && base(vars[v]) !== base(tipoEsperado)) erros.push(`${onde}: $${v} é ${vars[v]}, esperado ${tipoEsperado}`);
      return i + 2; }
    if (tk[i] === '{') { i++; const it = T[base(tipoEsperado || '')];
      while (tk[i] !== '}') { const k = tk[i]; i += 2; const ft = it && it.fields[k];
        if (it && !ft) erros.push(`${onde}: campo de entrada "${k}" não existe em ${it ? base(tipoEsperado) : '?'}`);
        i = valor(i, ft && ft.type, onde + '.' + k); if (tk[i] === ',') i++; }
      return i + 1; }
    if (tk[i] === '[') { i++; while (tk[i] !== ']') { i = valor(i, tipoEsperado && tipoEsperado.replace(/^\[|\]!?$/g, ''), onde); if (tk[i] === ',') i++; } return i + 1; }
    const t = T[base(tipoEsperado || '')];
    if (t && t.kind === 'enum' && /^[A-Z_]/.test(tk[i]) && !['true', 'false', 'null'].includes(tk[i]) && !t.values.has(tk[i])) erros.push(`${onde}: valor ${tk[i]} não existe no enum ${base(tipoEsperado)}`);
    return i + 1;
  }
  function selecao(i, tipo, caminho) {
    i++; // {
    while (tk[i] !== '}') {
      if (tk[i] === '...') {
        if (tk[i + 1] === 'on') { const alvo = tk[i + 2];
          if (!T[alvo]) erros.push(`${caminho}: tipo ${alvo} do fragmento não existe`);
          else if (!podeSer(tipo, alvo)) erros.push(`${caminho}: "... on ${alvo}" não se aplica a ${tipo}`);
          i = selecao(i + 3, alvo, caminho + '<' + alvo + '>'); continue; }
        erros.push(`${caminho}: fragmento nomeado não suportado`); i += 2; continue;
      }
      let f = tk[i]; i++;
      if (tk[i] === ':') { f = tk[i + 1]; i += 2; }
      const c = campo(tipo, f);
      if (!c) erros.push(`${caminho}.${f}: campo não existe em ${tipo}`);
      if (tk[i] === '(') { i++;
        while (tk[i] !== ')') { const a = tk[i]; i += 2;
          if (c && !(a in c.args)) erros.push(`${caminho}.${f}(${a}): argumento não existe`);
          i = valor(i, c && c.args[a], `${caminho}.${f}(${a})`); if (tk[i] === ',') i++; }
        i++;
        if (c) for (const [a, ty] of Object.entries(c.args)) if (ty.endsWith('!') && !src.includes(a)) erros.push(`${caminho}.${f}: argumento obrigatório ${a} ausente`);
      }
      i = pularDiretivas(tk, i);
      if (tk[i] === '{') {
        if (c && (escalares.has(base(c.type)) || T[base(c.type)]?.kind === 'enum')) erros.push(`${caminho}.${f}: é escalar e recebeu seleção`);
        i = selecao(i, c ? base(c.type) : '?', caminho + '.' + f);
      } else if (c && T[base(c.type)] && ['type', 'interface', 'union'].includes(T[base(c.type)].kind)) erros.push(`${caminho}.${f}: tipo ${base(c.type)} precisa de seleção`);
    }
    return i + 1;
  }
  selecao(i, raiz, raiz);
  for (const v of Object.keys(vars)) if (!usadas.has(v)) erros.push(`variável $${v} declarada e não usada`);
  return { erros, vars };
}

// ---------- carregar consultas da extensão ----------
const ctx = { console }; vm.createContext(ctx);
for (const f of ['shared/util.js', 'shared/config.js', 'content/queries.js']) vm.runInContext(fs.readFileSync(path.join(dirExt, f), 'utf8') + '\n;this.__Q = typeof QUERIES !== "undefined" ? QUERIES : this.__Q;', ctx, { filename: f });
const Q = ctx.__Q;
const ops = [];
for (const [k, v] of Object.entries(Q)) {
  if (v && v.query) ops.push([k, v]);
  else if (typeof v === 'function') {
    // funções que montam a consulta: tenta com os argumentos conhecidos
    const tentativas = [[], ['GESTANTE_PUERPERA'], ['PESSOA_IDOSA'], ['DESENVOLVIMENTO_INFANTIL'], ['DIABETES'], ['HIPERTENSAO_ARTERIAL'], ['SAUDE_MULHER'], ['GERAL'], ['GERAL_CODIGO']];
    const vistos = new Set();
    for (const a of tentativas) { try { const r = v(...a); const q = r && (r.query || r); if (typeof q === 'string' && !vistos.has(q)) { vistos.add(q); ops.push([k + '(' + a.join() + ')', { op: r.op, query: q }]); } } catch (_) {} }
  }
}
let total = 0, comErro = 0;
const relatorio = {};
for (const [k, v] of ops) {
  total++;
  const { erros, vars } = validarOperacao(k, v.query);
  relatorio[k] = { vars, erros };
  if (erros.length) { comErro++; console.log('✗ ' + k + '\n   ' + erros.join('\n   ')); } else console.log('✓ ' + k);
}
console.log(`\n${total} operações; ${comErro} com problema. Tipos no esquema: ${Object.keys(T).length}.`);
fs.writeFileSync('/tmp/validacao-vars.json', JSON.stringify(Object.fromEntries(Object.entries(relatorio).map(([k, r]) => [k, r.vars])), null, 1));
module.exports = { T };
