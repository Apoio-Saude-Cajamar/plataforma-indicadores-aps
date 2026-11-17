-- Painel APS: doses de vacina aplicadas no mês, lidas do relatório gerencial de vacinação do PEC (só totais, município inteiro).
-- Servem de estimativa ao lado do valor oficial lançado no cofinanciamento estadual. A tabela também se cria sozinha no primeiro uso.
CREATE TABLE IF NOT EXISTS vacina_pec (
  competencia TEXT NOT NULL, vacina TEXT NOT NULL, imunobiologico TEXT NOT NULL, faixa TEXT NOT NULL, dose TEXT NOT NULL,
  n INTEGER NOT NULL, atualizado_em TEXT NOT NULL, PRIMARY KEY (competencia, imunobiologico, faixa, dose));
