// Motor mínimo para as telas desenhadas no canvas (marcação com {{lacunas}}, repetição e condição).
// A marcação fica num <template>; a lógica é uma classe com renderVals(), como no desenho.
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); if (this.__desenhar) this.__desenhar(); }
}
function montarDC(modelo, Classe, alvo, props) {
  const comp = new Classe(props || {});
  const busca = (caminho, escopo) => {
    const partes = caminho.trim().split('.');
    let v;
    for (let i = escopo.length - 1; i >= 0; i--) if (escopo[i] && partes[0] in escopo[i]) { v = escopo[i][partes[0]]; break; }
    for (let i = 1; i < partes.length && v != null; i++) v = v[partes[i]];
    return v;
  };
  const RE = /\{\{([^}]+)\}\}/g;
  const valorDe = (txt, escopo) => {
    const m = /^\s*\{\{([^}]+)\}\}\s*$/.exec(txt);
    if (m) return busca(m[1], escopo);
    return txt.replace(RE, (_, c) => { const v = busca(c, escopo); return v == null ? '' : v; });
  };
  const BOOL = { checked: 1, disabled: 1, selected: 1 };
  function desenha(no, escopo, pai) {
    if (no.nodeType === 3) { pai.appendChild(document.createTextNode(no.nodeValue.indexOf('{{') < 0 ? no.nodeValue : String(valorDe(no.nodeValue, escopo) ?? ''))); return; }
    if (no.nodeType !== 1) return;
    if (no.tagName === 'TEMPLATE') {
      const filhos = no.content.childNodes, tipo = no.getAttribute('data-sc');
      if (tipo === 'for') { const lista = busca(no.getAttribute('list').replace(/[{}]/g, ''), escopo) || [], nome = no.getAttribute('as');
        lista.forEach(item => filhos.forEach(f => desenha(f, escopo.concat([{ [nome]: item }]), pai))); }
      else if (busca(no.getAttribute('value').replace(/[{}]/g, ''), escopo)) filhos.forEach(f => desenha(f, escopo, pai));
      return;
    }
    const el = document.createElement(no.tagName.toLowerCase());
    let valorSel;
    for (const a of no.attributes) {
      if (a.name.indexOf('hint-') === 0) continue;
      const v = a.value.indexOf('{{') < 0 ? a.value : valorDe(a.value, escopo);
      if (a.name === 'onclick' || a.name === 'onchange') { if (typeof v === 'function') el.addEventListener(a.name.slice(2), v); }
      else if (BOOL[a.name]) el[a.name] = v === true || v === 'true';
      else if (a.name === 'value' && el.tagName === 'SELECT') valorSel = v;
      else if (v !== false && v != null) el.setAttribute(a.name, v);
    }
    no.childNodes.forEach(f => desenha(f, escopo, el));
    if (valorSel !== undefined) el.value = valorSel;
    pai.appendChild(el);
  }
  const caminhoDe = el => { const c = []; while (el && el !== alvo) { c.unshift([].indexOf.call(el.parentNode.childNodes, el)); el = el.parentNode; } return el ? c : null; };
  comp.__desenhar = () => {
    const foco = alvo.contains(document.activeElement) ? caminhoDe(document.activeElement) : null;
    const frag = document.createDocumentFragment();
    const vals = comp.renderVals();
    modelo.content.childNodes.forEach(f => desenha(f, [vals], frag));
    alvo.replaceChildren(frag);
    if (foco) { let el = alvo; for (const i of foco) { el = el && el.childNodes[i]; } if (el && el.focus) el.focus({ preventScroll: true }); }
  };
  comp.__desenhar();
  return comp;
}
