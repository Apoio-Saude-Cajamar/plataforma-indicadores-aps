# Extensão conta, Painel calcula

Desenho da mudança combinada em 22/11/2026: a extensão do Chrome passa a enviar só **contagens**, e o **Painel** faz as contas
dos indicadores. Hoje a extensão calcula e envia o resultado pronto; uma regra errada (como a C1 sem a escuta inicial, ou o
Q14.2.1 com faltas zeradas) grava número errado no Painel e só se corrige com versão nova da extensão e coleta de novo.
Com o cálculo no Painel, uma regra corrigida vale na hora para todos os meses que têm as contagens guardadas.

## O que fica na extensão

Só ela vê dado pessoa a pessoa (que nunca sai do computador). Por isso continuam sendo apurados nela, e enviados como contagens:

| Indicador | Por que fica | O que vai ao Painel (já vai hoje) |
|---|---|---|
| C2 a C7, CR1 a CR3 | boas práticas por pessoa | denominador, soma de pontos e quantas pessoas cumpriram cada item |
| CVAT | cadastro e contatos por pessoa | totais ponderados de cadastro e acompanhamento |
| M1 | pessoas distintas atendidas | atendimentos e pessoas (com a faixa mínima e máxima) |
| B4 (numerador) | crianças distintas de 6 a 12 anos | crianças por eSB |

## O que passa para o Painel

| Indicador | Contagens que a extensão envia | Regra que passa a morar no Painel |
|---|---|---|
| C1 | atendimentos por unidade, equipe, CBO e tipo (`cubo_atendimento`); escuta inicial por equipe e categoria (`cubo_escuta`) | (consulta agendada + programada/cuidado continuado) ÷ (todos os tipos + escuta inicial); CBOs e equipes eSF/eAP da Nota C1; só equipe com a escuta de médico e enfermeiro lida no período certo |
| Q14.2.1 | faltas (`cubo_falta`) e atendimentos | faltas ÷ (atendimentos + faltas), com os filtros de CBO e tipo de falta |
| B1 | primeira consulta odontológica programática por eSB (`cubo_odonto`, novo); equipes com tipo, vínculo e horas (`cubo_equipe`, novo); pessoas vinculadas (Q12.2) | regra de referência da nota: eSB 40 h ↔ eSF 40 h ou 2 eAP 20 h; eSB 30 h ↔ eAP 30 h; eSB 20 h ↔ eAP 20 h (população inteira); 2 eSB 20 h ↔ eSF 40 h (metade) |
| B2, B3, B5, B6 | tratamento concluído e procedimentos por código (`cubo_odonto`) | listas de códigos de cada nota |
| B4 (divisor) | crianças de 6 a 12 anos vinculadas (VINC6A12) e `cubo_equipe` | mesma regra de referência da B1 |
| M2 | atividades coletivas compartilhadas, atendimentos compartilhados e cuidado compartilhado por equipe eMulti (`cubo_coletiva`, novo) | regra da NT 44/2026 |

## Fases

1. **O Painel aceita e guarda as contagens novas.** Tabelas `cubo_odonto`, `cubo_coletiva` e `cubo_equipe`, criadas pela própria API
   no primeiro uso (como `fila_horario`), sem mexer nas existentes. Etapas por unidade (`cubo-odonto:<unidade>`, `cubo-equipes:<unidade>`)
   e uma do município (`cubo-coletivas:1`). A extensão passa a enviá-las junto com as linhas de hoje.
   *Mexe no banco compartilhado entre produção e teste (só acrescenta tabelas) e precisa de merge no `main`, porque a extensão envia
   para o endereço de produção.*
2. **Regras no Painel, comparadas com as da extensão.** Um módulo só (C1, Q14.2.1, B1 a B6, B4, M2), levado de `calculo.js` e `panel.js`
   da extensão, com testes usando os dados de outubro: o Painel calcula e compara linha a linha com o que a extensão enviou.
   Diferença só onde a regra da extensão estava errada (por exemplo, C1 sem escuta).
3. **O Painel passa a usar o próprio cálculo.** Ao montar os dados de uma competência, os indicadores da tabela acima saem das contagens;
   onde não há contagens (meses antigos), vale a linha que a extensão mandou. Cada linha indica a origem. *Merge no `main`.*
4. **A extensão deixa de calcular** esses indicadores e envia só as contagens.

## Já feito na extensão 0.10.0 (preparação)

- A escuta inicial vai ao Painel numa etapa por unidade (`cubo-escuta:<unidade>`). As etapas antigas (`cubo-escuta:1`, do município todo)
  continuam no banco; a regra da fase 2 usa só as por unidade.
- Cada unidade vai ao Painel assim que termina; o envio final repete tudo sem duplicar.

## Cuidados

- Nomes de unidade e equipe vêm escritos de jeitos diferentes no relatório gerencial e nas listas do PEC: a regra compara pelo nome
  normalizado (sem acento e caixa), como a extensão já faz.
- Os relatórios clássicos (escuta inicial e saúde bucal) continuam sendo a única fonte desses dados: o PEC não os oferece pela API
  interna nem pelos relatórios gerenciais (conferido em 22/11/2026).
