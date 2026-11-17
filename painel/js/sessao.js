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
    alvo.innerHTML = menuUsuario(u);
    document.getElementById('btnSair').addEventListener('click', async () => {
      try { await fetch('/api/v1/auth/sair', { method: 'POST', credentials: 'same-origin' }); } finally { location.replace('/entrar'); }
    });
    document.addEventListener('click', e => { const d = alvo.querySelector('details[open]'); if (d && !d.contains(e.target)) d.removeAttribute('open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const d = alvo.querySelector('details[open]'); if (d) { d.removeAttribute('open'); d.querySelector('summary').focus(); } } });
    menu(u);
    avisos();
  }).catch(() => {});


  // Menu do usuário (à direita): perfil, senha, ajuda, configurações do administrador e sair.
  const I = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3.5 3.5 0 0 1 0 6.5M22 20c0-2.6-1.6-4.6-4-5.5"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    mega: '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM16 8a5 5 0 0 1 0 8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    puzzle: '<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    out: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>'
  };
  const ic = n => '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[n] + '</svg>';
  function menuUsuario(u) {
    const aqui = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const it = (href, ico, txt) => '<a href="' + href + '"' + (aqui === href ? ' aria-current="page"' : '') + '>' + ic(ico) + '<span>' + txt + '</span></a>';
    const perfil = { admin: 'Administrador', gestor: 'Gestor', leitor: 'Leitor' }[u.perfil] || u.perfil;
    const adm = u.perfil === 'admin' ? '<div class="usr-grupo">Configurações</div>'
      + it('/usuarios', 'users', 'Usuários') + it('/monitoramento', 'pulse', 'Monitoramento das coletas') + it('/comunicados', 'mega', 'Comunicados')
      + it('/publicacao', 'globe', 'Página pública') + it('/chaves', 'key', 'Chaves da extensão') + it('/extensao', 'puzzle', 'Extensões do Chrome')
      + it('/historico', 'clock', 'Histórico de acessos') + it('/backups', 'db', 'Backups') : '';
    if (!document.getElementById('estilo-usr')) {
      const st = document.createElement('style'); st.id = 'estilo-usr';
      st.textContent = '.barra-usuario .usr{position:relative}.barra-usuario .usr>summary{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;cursor:pointer;color:inherit;font:600 13px Montserrat,system-ui,sans-serif;padding:4px 10px 4px 4px;border:1px solid rgba(255,255,255,.6);border-radius:99px;min-height:36px}'
        + '.barra-usuario .usr>summary:hover{background:rgba(255,255,255,.14)}.barra-usuario .usr>summary:focus-visible{outline:3px solid #00A7E7;outline-offset:2px}'
        + '.usr-ini{width:26px;height:26px;border-radius:50%;background:#00A7E7;color:#fff;display:inline-grid;place-items:center;font-size:12px;font-weight:800}'
        + '.usr-painel{position:absolute;z-index:30;right:0;top:100%;margin-top:6px;min-width:260px;background:#fff;color:#1B2340;border:2px solid #D5DCE8;border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(20,33,43,.18);display:flex;flex-direction:column;font:600 14px Montserrat,system-ui,sans-serif}'
        + '.usr-painel a,.usr-painel button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;color:#1B2340;padding:8px 12px;border-radius:8px;cursor:pointer;min-height:36px;font:600 14px Montserrat,system-ui,sans-serif}'
        + '.usr-painel a:hover,.usr-painel button:hover{background:#E7EEF3}.usr-painel a[aria-current=page]{background:#D9ECF8}.usr-painel a:focus-visible,.usr-painel button:focus-visible{outline:3px solid #00A7E7;outline-offset:-2px}'
        + '.usr-painel svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.75}'
        + '.usr-cab{padding:8px 12px 10px;border-bottom:1px solid #E3E8F0;margin-bottom:4px;line-height:1.3}.usr-cab small{display:block;font-weight:600;font-size:12px;color:#4A5670}'
        + '.usr-grupo{padding:10px 12px 4px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#4A5670}.usr-sep{height:1px;background:#E3E8F0;margin:6px 0}'
        + 'html[data-tema=escuro] .usr-painel{background:#16202A;border-color:#2A3743;color:#E6EDF3}html[data-tema=escuro] .usr-painel a,html[data-tema=escuro] .usr-painel button{color:#E6EDF3}'
        + 'html[data-tema=escuro] .usr-painel a:hover,html[data-tema=escuro] .usr-painel button:hover{background:#22303C}html[data-tema=escuro] .usr-painel a[aria-current=page]{background:#1C2B38}'
        + 'html[data-tema=escuro] .usr-cab,html[data-tema=escuro] .usr-sep{border-color:#2A3743;background-color:transparent}html[data-tema=escuro] .usr-sep{background:#2A3743}html[data-tema=escuro] .usr-cab small,html[data-tema=escuro] .usr-grupo{color:#A7B4C0}'
        + 'html[data-tema=claro] .barra-usuario .usr>summary{border-color:#B9C4C9;color:#14212B}html[data-tema=claro] .barra-usuario .usr>summary:hover{background:#E7EEF3}';
      document.head.appendChild(st);
    }
    return '<details class="usr"><summary aria-label="Menu do usuário"><span class="usr-ini">' + esc((u.nome || '?').trim().charAt(0).toUpperCase()) + '</span>' + esc(u.nome.split(' ')[0]) + ' ▾</summary>'
      + '<div class="usr-painel"><div class="usr-cab">' + esc(u.nome) + '<small>' + esc(perfil) + '</small></div>'
      + it('/perfil', 'user', 'Meu perfil') + (u.origem === 'senha' ? it('/trocar-senha', 'key', 'Trocar senha') : '') + it('/ajuda', 'help', 'Ajuda e como ler os indicadores')
      + adm + '<div class="usr-sep"></div><button type="button" id="btnSair">' + ic('out') + '<span>Sair</span></button></div></details>';
  }

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
