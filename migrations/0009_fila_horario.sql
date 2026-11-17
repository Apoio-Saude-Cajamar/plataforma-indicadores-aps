-- Painel APS: faltas por horário (médicos e enfermeiros da Atenção Primária).
-- Uma linha por profissional, unidade, equipe e CBO em cada competência, com a grade do mês lida da agenda do PEC:
-- grade = { "dia da semana (1 = segunda ... 7 = domingo)": { "hora (0 a 23)": [agendados, atendidos, faltas] } }.
-- Só totais; nada de paciente. A recoleta do mesmo mês troca a grade do profissional.
-- A API cria esta tabela sozinha no primeiro uso (CREATE TABLE IF NOT EXISTS); este arquivo fica como registro.
CREATE TABLE IF NOT EXISTS fila_horario (
  competencia    TEXT NOT NULL,
  unidade        TEXT NOT NULL,
  equipe         TEXT NOT NULL DEFAULT '',
  cbo            TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  nome           TEXT NOT NULL,
  grade          TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  PRIMARY KEY (competencia, unidade, equipe, cbo, nome)
);
