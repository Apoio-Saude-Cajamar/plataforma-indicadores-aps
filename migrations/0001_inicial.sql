-- Esquema inicial da Plataforma de Indicadores APS – Cajamar.
-- Guarda apenas totais por equipe/unidade. Nenhum dado de paciente.

-- Cada execução da extensão: coleta completa, avulsa (partes escolhidas)
-- ou a recoleta dos relatórios gerenciais depois do 10º dia.
CREATE TABLE coleta (
  id              TEXT PRIMARY KEY,
  competencia     TEXT NOT NULL CHECK (competencia GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  tipo            TEXT NOT NULL DEFAULT 'completa'
                  CHECK (tipo IN ('completa', 'avulsa', 'final_gerenciais', 'importada')),
  versao_extensao TEXT,
  iniciado_em     TEXT NOT NULL,
  concluido_em    TEXT,
  status          TEXT NOT NULL DEFAULT 'em_andamento'
                  CHECK (status IN ('em_andamento', 'concluida', 'parcial', 'cancelada')),
  config          TEXT,            -- JSON com a configuração usada (unidades, filtros)
  recebido_em     TEXT NOT NULL
);
CREATE INDEX ix_coleta_competencia ON coleta (competencia);

-- Etapa = menor parte independente de uma coleta: uma lista de uma equipe,
-- um relatório gerencial, a escuta inicial de uma equipe e categoria.
-- Chaves: 'gerencial:atendimentos', 'gerencial:absenteismo',
--         'lista:gestantes:<INE>', 'vinculados:<INE>', 'escuta:<INE>:<CATEGORIA>' …
CREATE TABLE etapa (
  coleta_id    TEXT NOT NULL,
  chave        TEXT NOT NULL,
  competencia  TEXT NOT NULL,
  bloco        TEXT NOT NULL,
  unidade      TEXT,
  unidade_cnes TEXT,
  equipe       TEXT,
  ine          TEXT,
  tipo_equipe  TEXT,
  status       TEXT NOT NULL CHECK (status IN ('ok', 'falhou')),
  tentativas   INTEGER NOT NULL DEFAULT 1,
  erro         TEXT,
  coletado_em  TEXT NOT NULL,      -- quando a extensão leu o PEC (importa para as listas)
  recebido_em  TEXT NOT NULL,
  PRIMARY KEY (coleta_id, chave)
);
CREATE INDEX ix_etapa_vigencia ON etapa (competencia, chave, status, coletado_em);

-- Resultado por equipe calculado pela extensão.
-- recorte 'situacao' = quem está ativo na competência;
-- recorte 'desfecho' = quem fechou o puerpério / completou 2 anos na competência (C2/C3).
CREATE TABLE indicador_equipe (
  coleta_id    TEXT NOT NULL,
  etapa_chave  TEXT NOT NULL,
  competencia  TEXT NOT NULL,
  codigo       TEXT NOT NULL,
  recorte      TEXT NOT NULL DEFAULT 'situacao',
  unidade      TEXT NOT NULL,
  unidade_cnes TEXT,
  equipe       TEXT NOT NULL,
  ine          TEXT,
  tipo_equipe  TEXT,
  numerador    REAL,
  denominador  REAL,
  soma_pontos  REAL,
  valor        REAL,
  excluidos    INTEGER,
  itens        TEXT,               -- JSON: quantos cumpriram cada boa prática {"A":120,"B":98}
  extras       TEXT                -- JSON com contagens auxiliares
);
CREATE INDEX ix_indicador_etapa ON indicador_equipe (coleta_id, etapa_chave);
CREATE INDEX ix_indicador_competencia ON indicador_equipe (competencia, codigo, recorte);

-- Totais brutos dos relatórios gerenciais (permitem recalcular com outros filtros).
CREATE TABLE cubo_atendimento (
  coleta_id        TEXT NOT NULL,
  etapa_chave      TEXT NOT NULL,
  competencia      TEXT NOT NULL,
  unidade          TEXT,
  equipe           TEXT,
  cbo              TEXT,
  cbo_codigo       TEXT,
  grupo_cbo        TEXT,
  tipo_atendimento TEXT,
  n                INTEGER NOT NULL
);
CREATE INDEX ix_cubo_atendimento_etapa ON cubo_atendimento (coleta_id, etapa_chave);

CREATE TABLE cubo_falta (
  coleta_id   TEXT NOT NULL,
  etapa_chave TEXT NOT NULL,
  competencia TEXT NOT NULL,
  unidade     TEXT,
  equipe      TEXT,
  cbo         TEXT,
  cbo_codigo  TEXT,
  grupo_cbo   TEXT,
  tipo_falta  TEXT,
  n           INTEGER NOT NULL
);
CREATE INDEX ix_cubo_falta_etapa ON cubo_falta (coleta_id, etapa_chave);

CREATE TABLE cubo_escuta (
  coleta_id   TEXT NOT NULL,
  etapa_chave TEXT NOT NULL,
  competencia TEXT NOT NULL,
  unidade     TEXT,
  ine         TEXT,
  equipe      TEXT,
  categoria   TEXT,
  escuta      INTEGER NOT NULL,
  periodo_ok  INTEGER
);
CREATE INDEX ix_cubo_escuta_etapa ON cubo_escuta (coleta_id, etapa_chave);

CREATE TABLE aviso (
  coleta_id   TEXT NOT NULL,
  etapa_chave TEXT,
  competencia TEXT,
  mensagem    TEXT NOT NULL,
  criado_em   TEXT NOT NULL
);
CREATE INDEX ix_aviso_coleta ON aviso (coleta_id, etapa_chave);

-- Controle interno (versão do esquema e última alteração, usada pelo backup).
CREATE TABLE meta (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
INSERT INTO meta (chave, valor) VALUES ('versao_esquema', '1'), ('ultima_alteracao', NULL);

-- Versão vigente de cada etapa numa competência: a última leitura bem-sucedida.
-- Assim uma nova tentativa, uma coleta avulsa ou a recoleta após o 10º dia
-- substituem a anterior sem apagar o histórico.
CREATE VIEW etapa_vigente AS
SELECT e.*
FROM etapa e
WHERE e.status = 'ok'
  AND NOT EXISTS (
    SELECT 1 FROM etapa e2
    WHERE e2.competencia = e.competencia
      AND e2.chave = e.chave
      AND e2.status = 'ok'
      AND (e2.coletado_em > e.coletado_em
           OR (e2.coletado_em = e.coletado_em AND e2.coleta_id > e.coleta_id))
  );
