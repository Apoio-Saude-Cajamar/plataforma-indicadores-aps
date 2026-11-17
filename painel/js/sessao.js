// Barra do usuário logado (nome, Usuários para administradores, Trocar senha e Sair).
// Coloca a barra no elemento #barra; se não houver, cria um ao final do cabeçalho.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  fetch('/api/v1/auth/eu', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.usuario) return;
    const u = d.usuario;
    window.PAINELAPS_USUARIO = u;
    document.dispatchEvent(new CustomEvent('painelaps:usuario', { detail: u }));
    let alvo = document.getElementById('barra');
    if (!alvo) {
      alvo = document.createElement('div');
      const top = document.querySelector('header .top > div:last-child') || document.querySelector('header');
      top.appendChild(alvo);
    }
    alvo.className = 'barra-usuario';
    alvo.innerHTML = '<span title="' + esc(u.login) + '">' + esc(u.nome.split(' ')[0]) + '</span>'
      + (u.perfil === 'admin' ? '<a href="/usuarios">Usuários</a>' : '')
      + (u.origem === 'senha' ? '<a href="/trocar-senha">Senha</a>' : '')
      + '<button type="button" id="btnSair">Sair</button>';
    menu(u);
    avisos();
    document.getElementById('btnSair').addEventListener('click', async () => {
      try { await fetch('/api/v1/auth/sair', { method: 'POST', credentials: 'same-origin' }); } finally { location.replace('/entrar'); }
    });
  }).catch(() => {});


  // Menu do cabeçalho (páginas com o cabeçalho padrão .topo): atalhos para as áreas e para os formulários de lançamento.
  function menu(u) {
    const topo = document.querySelector('header .topo');
    if (!topo || topo.querySelector('.menu-aps')) return;
    const gestor = u.perfil === 'admin' || u.perfil === 'gestor';
    const aqui = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const a = (href, txt) => '<a href="' + href + '"' + (aqui === href ? ' aria-current="page"' : '') + '>' + txt + '</a>';
    if (!document.getElementById('estilo-menu')) {
      const st = document.createElement('style'); st.id = 'estilo-menu';
      st.textContent = '.menu-aps{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;font:600 14px Montserrat,system-ui,sans-serif}'
        + '.menu-aps a,.menu-aps summary{color:#fff;text-decoration:none;padding:8px 12px;border-radius:99px;cursor:pointer;list-style:none;min-height:36px;display:inline-flex;align-items:center}'
        + '.menu-aps summary::-webkit-details-marker{display:none}'
        + '.menu-aps a:hover,.menu-aps summary:hover{background:rgba(255,255,255,.14)}'
        + '.menu-aps a[aria-current=page]{background:rgba(255,255,255,.22)}'
        + '.menu-aps a:focus-visible,.menu-aps summary:focus-visible{outline:3px solid #00A7E7;outline-offset:2px}'
        + '.menu-aps details{position:relative}.menu-aps details>div{position:absolute;z-index:20;top:100%;left:0;min-width:230px;margin-top:6px;background:#fff;border:2px solid #D5DCE8;border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(20,33,43,.18);display:flex;flex-direction:column}'
        + '.menu-aps details>div a{color:#1B2340;border-radius:8px;white-space:nowrap}.menu-aps details>div a:hover{background:#E7EEF3}.menu-aps details>div a[aria-current=page]{background:#D9ECF8}';
      document.head.appendChild(st);
    }
    const lanc = gestor ? '<details><summary>Lançamentos ▾</summary><div>' + a('/lancamentos', 'Metas do PAS') + a('/lancamentos-vacinas', 'Coberturas vacinais') + '<a href="/estadual#t-form">Cofinanciamento estadual</a></div></details>' : '';
    const nav = document.createElement('nav');
    nav.className = 'menu-aps'; nav.setAttribute('aria-label', 'Áreas do Painel');
    nav.innerHTML = a('/', 'Acompanhamentos') + a('/composicao', 'Composição') + (gestor ? a('/filas', 'Filas e faltas') : '') + lanc;
    const alvo = topo.querySelector('#barra');
    topo.insertBefore(nav, alvo || null);
    const tm = topo.querySelector('.tema-aps'); if (tm) topo.insertBefore(tm, alvo || null);
    document.addEventListener('click', e => { const d = nav.querySelector('details[open]'); if (d && !d.contains(e.target)) d.removeAttribute('open'); });
  }

  // Comunicados internos: faixa no topo até a pessoa marcar "Entendi".
  function avisos() {
    if (/^\/(comunicados|trocar-senha)/.test(location.pathname)) return;
    fetch('/api/v1/comunicados/ativos', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
      const novos = d && (d.comunicados || []).filter(c => !c.lido);
      if (!novos || !novos.length) return;
      if (!document.getElementById('estilo-comunicados')) {
        const st = document.createElement('style'); st.id = 'estilo-comunicados';
        st.textContent = '#comunicados{max-width:1100px;margin:16px auto 0;padding:0 32px;display:flex;flex-direction:column;gap:10px}'
          + '.comunicado{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;background:#E1F4FC;border:2px solid #9AD6F0;border-left:8px solid #00A7E7;border-radius:12px;padding:14px 18px;color:#0B3A52;font-family:Montserrat,system-ui,sans-serif}'
          + '.comunicado.importante{background:#FBF0D3;border-color:#E8C873;border-left-color:#E0A41B;color:#5C3D00}'
          + '.comunicado b{display:block;font-size:15px;margin-bottom:2px}.comunicado p{margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap}'
          + '.comunicado button{flex:0 0 auto;font:inherit;font-weight:700;font-size:13px;color:inherit;background:#fff;border:2px solid currentColor;border-radius:99px;padding:5px 14px;cursor:pointer}'
          + '@media(max-width:600px){#comunicados{padding:0 16px}.comunicado{flex-direction:column}}';
        document.head.appendChild(st);
      }
      const box = document.createElement('div'); box.id = 'comunicados'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Comunicados');
      novos.forEach(c => {
        const el = document.createElement('div'); el.className = 'comunicado' + (c.nivel === 'importante' ? ' importante' : '');
        const t = document.createElement('div'); const b = document.createElement('b'); b.textContent = c.titulo; const p = document.createElement('p'); p.textContent = c.texto; t.append(b, p);
        const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'Entendi';
        bt.addEventListener('click', () => { fetch('/api/v1/comunicados/' + c.id + '/lido', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); el.remove(); if (!box.children.length) box.remove(); });
        el.append(t, bt); box.appendChild(el);
      });
      const h = document.querySelector('header');
      if (h) h.insertAdjacentElement('afterend', box); else document.body.prepend(box);
    }).catch(() => {});
  }
})();
