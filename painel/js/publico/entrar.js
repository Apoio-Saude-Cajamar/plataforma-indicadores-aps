// Página de entrada do Painel APS.
(function () {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  // Só volta para caminhos internos (evita redirecionamento para outro site).
  const volta = (() => { const v = params.get('volta') || '/'; return /^\/(?!\/)/.test(v) ? v : '/'; })();

  function mostrar(texto) { const m = $('msg'); m.textContent = texto; m.hidden = !texto; }
  if (params.get('erro')) mostrar(params.get('erro'));

  fetch('/api/v1/auth/config').then(r => r.json()).then(c => {
    if (c.apoio && c.apoio.ligado && c.apoio.loginUrl) {
      $('linkApoio').href = c.apoio.loginUrl + '?next=' + encodeURIComponent(location.origin + '/auth/apoio');
      $('apoio').hidden = false;
    }
  }).catch(() => {});

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    mostrar('');
    const login = $('login').value.trim(), senha = $('senha').value;
    if (!login || !senha) { mostrar('Informe usuário e senha.'); return; }
    const b = $('entrar');
    b.disabled = true; b.textContent = 'Entrando…';
    try {
      const r = await fetch('/api/v1/auth/entrar', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login, senha })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { mostrar(d.erro || 'Não foi possível entrar.'); $('senha').value = ''; $('senha').focus(); return; }
      location.replace(d.trocarSenha ? '/trocar-senha' : volta);
    } catch {
      mostrar('Sem conexão com o Painel APS. Tente de novo.');
    } finally {
      b.disabled = false; b.textContent = 'Entrar';
    }
  });
})();
