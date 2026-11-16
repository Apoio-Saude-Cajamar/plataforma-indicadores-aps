-- Painel APS: lançamentos por formulário (metas da PAS que não vêm do PEC e coberturas vacinais do Ministério).
-- Só inclusões: cada lançamento fica guardado, e o valor vigente de um item no mês é o lançamento mais recente.
CREATE TABLE lancamento (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('meta', 'vacina')),
  item        TEXT NOT NULL,
  competencia TEXT NOT NULL,
  valor       REAL NOT NULL,
  obs         TEXT,
  lancado_por INTEGER,
  lancado_em  TEXT NOT NULL
);
CREATE INDEX ix_lancamento_item ON lancamento (tipo, item, competencia, id);
