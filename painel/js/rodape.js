// Rodapé padrão do Painel APS: caminho para a documentação (como coletamos e como calculamos).
// Fica fora da área que as telas redesenham, então não some quando a tela atualiza.
(function () {
  if (document.getElementById('rodape-aps')) return;
  var st = document.createElement('style');
  st.textContent = '#rodape-aps{max-width:1100px;margin:32px auto 0;padding:16px 32px 28px;border-top:1px solid rgba(120,130,150,.35);'
    + 'font:500 13px/1.5 Montserrat,system-ui,sans-serif;color:inherit;display:flex;flex-wrap:wrap;gap:6px 20px;align-items:center}'
    + '#rodape-aps b{font-weight:700}#rodape-aps a{color:inherit;text-decoration:underline;text-underline-offset:3px}'
    + '#rodape-aps a:focus-visible{outline:3px solid #00A7E7;outline-offset:3px}#rodape-aps .fim{margin-left:auto;opacity:.8}'
    + '@media print{#rodape-aps{display:none}}';
  document.head.appendChild(st);
  // O relatório já abre no tipo da tela de onde se vem.
  var ROTAS = { '/indicadores': 'federal', '/notas': 'federal', '/estadual': 'estadual', '/municipal': 'municipal', '/filas': 'absenteismo', '/federal': 'federal' };
  var tipo = ROTAS[location.pathname.replace(/\/$/, '').replace(/\.html$/, '')] || 'geral';
  var f = document.createElement('footer');
  f.id = 'rodape-aps';
  f.innerHTML = '<b>Painel APS · Cajamar</b>'
    + '<a href="/relatorio?tipo=' + tipo + '">Exportar relatório (PDF/CSV)</a>'
    + '<a href="/coleta">Como coletamos</a>'
    + '<a href="/coleta#calculamos">Como calculamos</a>'
    + '<a href="/coleta#privacidade">Privacidade dos dados</a>'
    + '<span class="fim">Só totais; sem dados de pacientes.</span>';
  document.body.appendChild(f);
})();
