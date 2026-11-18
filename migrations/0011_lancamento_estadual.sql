-- Painel APS: lançamentos do cofinanciamento estadual (IGM SUS Paulista). A tabela também se cria sozinha no primeiro uso (api/estadual.js);
-- esta migração só garante que um banco novo, montado pelas migrações, a tenha desde o início. Segura para rodar onde ela já existe.
CREATE TABLE IF NOT EXISTS lancamento_estadual (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, periodo TEXT NOT NULL,
  valor REAL, anterior REAL, mediana REAL, quartil INTEGER, quartil_ant INTEGER,
  obs TEXT, lancado_por INTEGER, lancado_em TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_lancamento_estadual ON lancamento_estadual (item, periodo, id);
