-- Painel APS: o que o administrador autorizou a mostrar na página pública (sem senha).
-- Tudo nasce privado. Só totais agregados entram no catálogo; nada de pessoas ou equipes.
CREATE TABLE publicacao_item (
  item          TEXT PRIMARY KEY,
  publicado_em  TEXT NOT NULL,
  publicado_por INTEGER
);

-- Histórico de cada autorização (quem, quando, o que passou a ser público ou privado).
CREATE TABLE publicacao_historico (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quando      TEXT NOT NULL,
  usuario_id  INTEGER,
  acao        TEXT NOT NULL,
  detalhe     TEXT
);
