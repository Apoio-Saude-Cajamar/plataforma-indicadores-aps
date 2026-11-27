// Equipes homologadas, isto é, avaliadas pelo Ministério no cofinanciamento federal. Vale o que o administrador marcou
// na página Composição; equipe sem marcação segue a regra padrão abaixo. Usado no Dashboard, em Dados e na prévia do
// repasse. Só INE, tipo e nome de equipe: nada sobre pessoas.
var HOMOLOGACAO = (function () {
  let marcadas = {};
  let pronto = null;
  const ine10 = (v) => String(v == null ? '' : v).replace(/\D/g, '').padStart(10, '0');
  // Tipo pelo cadastro; sem ele (linhas da odontologia e da C1 não trazem), pelo nome.
  const tipoDe = (tipo, nome) => {
    const t = String(tipo || '').toUpperCase();
    if (t) return t;
    const n = String(nome || '').toUpperCase();
    if (/COMPLEMENTAR|ESTRAT|AMPLIAD/.test(n)) return 'EMULTI';
    if (/CONSULT.*RUA/.test(n)) return 'ECR';
    if (/ODONTO|^ESB\b/.test(n)) return 'ESB';
    return '';
  };
  // Regra padrão, tirada da comparação com o Siaps de 2026: as eSF, eAP e eSB com INE iniciado em 00025 (criadas em
  // 2025) e a eMulti Estratégica ainda não aparecem na avaliação federal; as demais aparecem. eMulti complementares e
  // eCR têm INE 00025 e entram.
  function padrao(ine, tipo, nome) {
    const t = tipoDe(tipo, nome);
    if (t === 'EMULTI') return !/ESTRAT/i.test(nome || '');
    if (t === 'ECR') return true;
    return !ine10(ine).startsWith('00025');
  }
  function marcada(ine) {
    const k = ine10(ine);
    return Object.prototype.hasOwnProperty.call(marcadas, k) ? !!marcadas[k] : null;
  }
  function homologada(ine, tipo, nome) {
    const m = marcada(ine);
    return m === null ? padrao(ine, tipo, nome) : m;
  }
  function carregar(forcar) {
    if (pronto && !forcar) return pronto;
    pronto = (async () => {
      try {
        const r = await fetch('/api/v1/equipes/homologacao', { credentials: 'same-origin' });
        if (r.ok) marcadas = (await r.json()).marcadas || {};
      } catch (_) {
        /* sem a marcação, vale a regra padrão */
      }
      return marcadas;
    })();
    return pronto;
  }
  // Recorta as linhas de /api/v1/dados ({ "AAAA-MM": [linhas] }) por equipe: 'todas' (sem recorte), 'homologadas' ou
  // 'nao'. Linhas sem INE (C1, Q14.2.1) herdam o INE das outras linhas da mesma equipe; o que não é equipe (Sem
  // equipe, totais do município) só aparece em 'todas'.
  function filtrar(porComp, modo) {
    if (!modo || modo === 'todas') return porComp;
    const porLocal = new Map(),
      porNome = new Map();
    for (const ls of Object.values(porComp))
      for (const l of ls) {
        if (!l.ine) continue;
        const k = l.unidade + '|' + l.equipe;
        const o = porLocal.get(k) || { ine: l.ine, tipo: null };
        if (!o.tipo && l.tipoEquipe) o.tipo = l.tipoEquipe;
        porLocal.set(k, o);
        if (!porNome.has(l.equipe)) porNome.set(l.equipe, o);
      }
    const quer = modo === 'homologadas';
    const out = {};
    for (const [c, ls] of Object.entries(porComp))
      out[c] = ls.filter((l) => {
        const o = porLocal.get(l.unidade + '|' + l.equipe) || porNome.get(l.equipe);
        return !!o && homologada(o.ine, o.tipo, l.equipe) === quer;
      });
    return out;
  }
  const ROTULO = { todas: 'Todas as equipes', homologadas: 'Homologadas', nao: 'Não homologadas' };
  return { carregar, padrao, marcada, homologada, filtrar, ine10, ROTULO, marcadas: () => marcadas };
})();
