// Barra do usuário logado (nome, Usuários para administradores, Trocar senha e Sair).
// Coloca a barra no elemento #barra; se não houver, cria um ao final do cabeçalho.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  fetch('/api/v1/auth/eu', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.usuario) return;
    const u = d.usuario;
    window.PAINELAPS_USUARIO = u;
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
    document.getElementById('btnSair').addEventListener('click', async () => {
      try { await fetch('/api/v1/auth/sair', { method: 'POST', credentials: 'same-origin' }); } finally { location.replace('/entrar'); }
    });
  }).catch(() => {});
})();
