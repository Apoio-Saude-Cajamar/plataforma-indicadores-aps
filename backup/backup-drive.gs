/**
 * Backup mensal da Plataforma de Indicadores APS (Cajamar) para o Google Drive.
 *
 * O script roda nos servidores do Google, na conta dona da pasta de backup.
 * Todo dia 10, às 6h, ele baixa o banco inteiro pela API (somente leitura),
 * confere as contagens, salva um arquivo .json.gz na pasta e reabre o arquivo
 * para conferir. Avisa por e-mail se algo falhar ou se a coleta do mês
 * anterior ainda não tiver entrado no banco.
 *
 * Instalação (uma vez):
 *  1. Em https://script.google.com crie um projeto ("Backup Indicadores APS")
 *     e cole este arquivo no lugar do Code.gs.
 *  2. Em Configurações do projeto → Propriedades do script, crie:
 *       API_URL       endereço da plataforma, ex.: https://indicadores-aps.apoiosaude.workers.dev
 *       TOKEN_BACKUP  chave de backup (somente leitura) configurada no Cloudflare
 *       PASTA_ID      ID da pasta do Drive (o trecho final do endereço da pasta)
 *       EMAIL_ALERTA  (opcional) quem recebe os avisos; padrão: o dono do script
 *  3. Execute instalarAgendamento() e autorize o acesso pedido pelo Google.
 *  4. Execute fazerBackup() uma vez para testar.
 *
 * Restauração: veja restaurarBackup(), no fim do arquivo.
 */

var CONFIG_BACKUP = {
  diaDoMes: 10,
  hora: 6,
  fuso: 'America/Sao_Paulo',
  pagina: 2000,          // linhas por requisição
  tentativas: 3,         // novas tentativas em falhas passageiras (somente leitura)
  avisoTamanho: 30e6     // avisa quando o backup passar de ~30 MB sem compactar
};

var FRASE_RESTAURACAO = 'APAGAR E RESTAURAR';

/** Cria (ou recria) o agendamento mensal. */
function instalarAgendamento() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fazerBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fazerBackup')
    .timeBased()
    .onMonthDay(CONFIG_BACKUP.diaDoMes)
    .atHour(CONFIG_BACKUP.hora)
    .inTimezone(CONFIG_BACKUP.fuso)
    .create();
  console.log('Backup agendado para todo dia ' + CONFIG_BACKUP.diaDoMes + ', por volta das ' + CONFIG_BACKUP.hora + 'h.');
}

/** Faz o backup completo do banco e salva na pasta configurada. */
function fazerBackup() {
  var cfg = configuracao_();
  try {
    var manifesto = chamar_(cfg, 'get', '/backup/manifesto');
    var tabelas = {};
    Object.keys(manifesto.tabelas).forEach(function (nome) {
      tabelas[nome] = baixarTabela_(cfg, nome, manifesto.tabelas[nome]);
    });

    // Se algo entrou no banco durante o backup, a cópia pode estar misturada: refaça.
    var depois = chamar_(cfg, 'get', '/backup/manifesto');
    if (depois.ultimaAlteracao !== manifesto.ultimaAlteracao) {
      throw new Error('O banco recebeu dados durante o backup. Execute fazerBackup() novamente.');
    }

    var conteudo = JSON.stringify({
      formato: manifesto.formato,
      versaoEsquema: manifesto.versaoEsquema,
      geradoEm: new Date().toISOString(),
      ultimaAlteracao: manifesto.ultimaAlteracao,
      contagens: manifesto.tabelas,
      tabelas: tabelas
    });
    if (conteudo.length > CONFIG_BACKUP.avisoTamanho) {
      // O Apps Script tem limite de tamanho para arquivos em memória (cerca de 50 MB).
      alertar_(cfg, 'Backup perto do limite de tamanho',
        'O backup tem ' + Math.round(conteudo.length / 1e6) + ' MB antes de compactar. ' +
        'Está na hora de dividir o backup por ano (ver README do repositório).');
    }
    var nome = Utilities.formatDate(new Date(), CONFIG_BACKUP.fuso, 'yyyy-MM-dd_HHmm') + '_indicadores-aps.json';
    var compactado = Utilities.gzip(Utilities.newBlob(conteudo, 'application/json', nome), nome + '.gz');
    var arquivo = DriveApp.getFolderById(cfg.pasta).createFile(compactado);
    var sha = sha256_(conteudo);
    arquivo.setDescription('Backup da Plataforma de Indicadores APS. sha256=' + sha +
      ' contagens=' + JSON.stringify(manifesto.tabelas));

    // Conferência: reabre o arquivo salvo e compara com o que foi baixado.
    var conferido = lerArquivo_(arquivo.getId());
    if (sha256_(conferido) !== sha) throw new Error('O arquivo salvo no Drive não confere com o conteúdo baixado.');

    var comp = competenciaAnterior_();
    var temColeta = tabelas.coleta.some(function (c) { return c.competencia === comp && c.status !== 'cancelada'; });
    if (!temColeta) {
      alertar_(cfg, 'Coleta de ' + comp + ' ainda não entrou',
        'O backup de hoje foi feito, mas a coleta da competência ' + comp + ' ainda não está no banco.\n\n' +
        'Abra o PEC no Chrome, faça login e rode a coleta pela extensão. Depois, se quiser, execute fazerBackup() de novo.');
    }
    console.log('Backup salvo: ' + arquivo.getName() + ' (' + conteudo.length + ' caracteres antes de compactar).');
    return { arquivo: arquivo.getName(), id: arquivo.getId(), sha256: sha, contagens: manifesto.tabelas, coletaPendente: !temColeta };
  } catch (e) {
    alertar_(cfg, 'Falha no backup mensal',
      'O backup da Plataforma de Indicadores APS não foi concluído.\n\nErro: ' + e.message +
      '\n\nAbra o projeto do script e execute fazerBackup() manualmente. Se o erro continuar, verifique a API_URL e a TOKEN_BACKUP.');
    throw e;
  }
}

function baixarTabela_(cfg, nome, esperado) {
  var linhas = [];
  var depois = 0;
  while (true) {
    var r = chamar_(cfg, 'get', '/backup/tabela/' + nome + '?depois=' + depois + '&limite=' + CONFIG_BACKUP.pagina);
    for (var i = 0; i < r.linhas.length; i++) linhas.push(r.linhas[i]);
    if (r.proximo === null) break;
    depois = r.proximo;
  }
  if (linhas.length !== esperado) {
    throw new Error('Tabela ' + nome + ': esperava ' + esperado + ' linhas e recebi ' + linhas.length + '.');
  }
  return linhas;
}

/**
 * Restaura o banco a partir de um arquivo de backup do Drive. APAGA OS DADOS ATUAIS.
 *
 * Para usar, crie temporariamente nas Propriedades do script:
 *   TOKEN_ADMIN           chave de administração
 *   RESTAURAR_ARQUIVO_ID  ID do arquivo .json.gz a restaurar
 *   RESTAURAR_CONFIRMO    APAGAR E RESTAURAR
 * e execute restaurarBackup(). Essas três propriedades são apagadas ao final.
 */
function restaurarBackup() {
  var props = PropertiesService.getScriptProperties();
  var cfg = configuracao_();
  var tokenAdmin = props.getProperty('TOKEN_ADMIN');
  var idArquivo = props.getProperty('RESTAURAR_ARQUIVO_ID');
  if (!tokenAdmin || !idArquivo || props.getProperty('RESTAURAR_CONFIRMO') !== FRASE_RESTAURACAO) {
    throw new Error('Para restaurar, crie TOKEN_ADMIN, RESTAURAR_ARQUIVO_ID e RESTAURAR_CONFIRMO = "' + FRASE_RESTAURACAO + '".');
  }
  try {
    var backup = JSON.parse(lerArquivo_(idArquivo));
    if (backup.formato !== 'indicadores-aps-backup') throw new Error('O arquivo escolhido não é um backup da plataforma.');

    chamar_(cfg, 'post', '/restauracao/iniciar', { confirmar: FRASE_RESTAURACAO, versaoEsquema: backup.versaoEsquema }, tokenAdmin);
    Object.keys(backup.tabelas).forEach(function (nome) {
      var linhas = backup.tabelas[nome];
      for (var i = 0; i < linhas.length; i += CONFIG_BACKUP.pagina) {
        chamar_(cfg, 'post', '/restauracao/tabela/' + nome, { linhas: linhas.slice(i, i + CONFIG_BACKUP.pagina) }, tokenAdmin);
      }
    });
    var resultado = chamar_(cfg, 'post', '/restauracao/concluir', { contagens: backup.contagens }, tokenAdmin);
    if (!resultado.ok) {
      throw new Error('A restauração terminou com diferenças nas contagens: ' + JSON.stringify(resultado.divergencias) +
        '. Execute restaurarBackup() de novo.');
    }
    console.log('Restauração concluída: ' + JSON.stringify(resultado.contagens));
    return resultado;
  } finally {
    ['TOKEN_ADMIN', 'RESTAURAR_ARQUIVO_ID', 'RESTAURAR_CONFIRMO'].forEach(function (k) { props.deleteProperty(k); });
  }
}

/* ---------- auxiliares ---------- */

function configuracao_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    url: String(p.getProperty('API_URL') || '').replace(/\/+$/, ''),
    token: p.getProperty('TOKEN_BACKUP'),
    pasta: p.getProperty('PASTA_ID'),
    email: p.getProperty('EMAIL_ALERTA') || Session.getEffectiveUser().getEmail()
  };
  if (!cfg.url || !cfg.token || !cfg.pasta) {
    throw new Error('Configure API_URL, TOKEN_BACKUP e PASTA_ID em Configurações do projeto → Propriedades do script.');
  }
  return cfg;
}

// Leituras (GET) são repetidas em falhas passageiras. Gravações (POST) não são
// repetidas automaticamente: uma restauração interrompida deve ser refeita do início.
function chamar_(cfg, metodo, caminho, corpo, token) {
  var opcoes = {
    method: metodo,
    muteHttpExceptions: true,
    followRedirects: false,
    headers: { Authorization: 'Bearer ' + (token || cfg.token) }
  };
  if (corpo !== undefined) {
    opcoes.contentType = 'application/json';
    opcoes.payload = JSON.stringify(corpo);
  }
  var maxTentativas = metodo === 'get' ? CONFIG_BACKUP.tentativas : 1;
  var ultimoErro = null;
  for (var t = 1; t <= maxTentativas; t++) {
    var passageiro = true;
    try {
      var resposta = UrlFetchApp.fetch(cfg.url + '/api/v1' + caminho, opcoes);
      var codigo = resposta.getResponseCode();
      var texto = resposta.getContentText('UTF-8');
      if (codigo >= 200 && codigo < 300) return JSON.parse(texto);
      passageiro = codigo >= 500 || codigo === 429;
      ultimoErro = new Error('HTTP ' + codigo + ' em ' + caminho + ': ' + texto.slice(0, 300));
    } catch (e) {
      ultimoErro = e; // falha de rede
    }
    if (!passageiro) break;
    if (t < maxTentativas) Utilities.sleep(3000 * t);
  }
  throw ultimoErro;
}

function lerArquivo_(id) {
  var blob = DriveApp.getFileById(id).getBlob();
  if (/\.gz$/i.test(blob.getName())) blob = Utilities.ungzip(blob.setContentType('application/x-gzip'));
  return blob.getDataAsString('UTF-8');
}

function sha256_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function competenciaAnterior_() {
  var partes = Utilities.formatDate(new Date(), CONFIG_BACKUP.fuso, 'yyyy-MM').split('-');
  var ano = Number(partes[0]);
  var mes = Number(partes[1]) - 1;
  if (mes === 0) { mes = 12; ano -= 1; }
  return ano + '-' + (mes < 10 ? '0' : '') + mes;
}

function alertar_(cfg, assunto, mensagem) {
  try {
    MailApp.sendEmail(cfg.email, '[Indicadores APS] ' + assunto, mensagem);
  } catch (e) {
    console.error('Não consegui enviar o e-mail de aviso: ' + e.message);
  }
}
