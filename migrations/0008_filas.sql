-- Painel APS: filas e faltas por profissional (médicos e enfermeiros da Atenção Primária).
-- Uma linha por profissional, unidade, equipe e CBO em cada competência. Só totais; nada de paciente.
-- A recoleta do mesmo mês atualiza os campos que trouxe e mantém os demais.
CREATE TABLE fila_profissional (
  competencia    TEXT NOT NULL,
  unidade        TEXT NOT NULL,
  equipe         TEXT NOT NULL DEFAULT '',
  cbo            TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  nome           TEXT NOT NULL,
  faltas         INTEGER,
  atendimentos   INTEGER,
  dias_vaga      INTEGER,
  proxima_vaga   TEXT,
  sem_vaga       INTEGER,
  agenda_lida_em TEXT,
  atualizado_em  TEXT NOT NULL,
  PRIMARY KEY (competencia, unidade, equipe, cbo, nome)
);
