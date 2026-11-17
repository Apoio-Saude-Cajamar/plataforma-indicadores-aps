// Tema das páginas padrão (claro, personalizado, escuro): aplica a escolha guardada e põe o seletor de ícones no cabeçalho.
// A mesma escolha vale para a tela de notas (chave "painelaps.tema").
(function () {
  const CH = 'painelaps.tema', TEMAS = ['claro', 'personalizado', 'escuro'];
  const ler = () => { try { const t = localStorage.getItem(CH); return TEMAS.includes(t) ? t : 'personalizado'; } catch (e) { return 'personalizado'; } };
  const aplicar = t => { document.documentElement.setAttribute('data-tema', t); };
  aplicar(ler());
  const ICONES = {
    claro: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    personalizado: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.8-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
    escuro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>'
  };
  const ROTULO = { claro: 'Tema claro', personalizado: 'Tema personalizado (cores de Cajamar)', escuro: 'Tema escuro' };
  function montar() {
    const topo = document.querySelector('header .topo');
    if (!topo || topo.querySelector('.tema-aps')) return;
    const g = document.createElement('div');
    g.className = 'tema-aps'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Tema');
    g.innerHTML = TEMAS.map(t => '<button type="button" data-t="' + t + '" title="' + ROTULO[t] + '" aria-label="' + ROTULO[t] + '" aria-pressed="false">' + ICONES[t] + '</button>').join('');
    const marcar = () => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === ler())));
    g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; try { localStorage.setItem(CH, b.dataset.t); } catch (_) {} aplicar(b.dataset.t); marcar(); });
    marcar();
    const alvo = topo.querySelector('#barra');
    topo.insertBefore(g, alvo || null);
  }
  window.TEMA_APS = { montar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
