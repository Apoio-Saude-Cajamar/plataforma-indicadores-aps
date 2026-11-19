// Como cada item é extraído do PEC e-SUS. Fonte única: o painel da extensão (ícones ⓘ) e a página "Como coletamos" do Painel APS usam este texto.
// Mantenha as duas cópias iguais: coletor-aps/shared/extracao.js e plataforma-indicadores-aps/painel/js/extracao.js (o teste confere).
(function (raiz) {
  const SO_TOTAIS = 'Só totais (números por unidade e equipe). Nenhum nome de paciente, CPF ou prontuário é guardado ou enviado.';
  const FINALIDADES = {
    federal: 'Cofinanciamento federal',
    estadual: 'Cofinanciamento estadual',
    municipal: 'Acompanhamento municipal e gestão'
  };
  // escopo: 'municipio' (uma consulta para o município inteiro), 'unidade' (uma passada em cada unidade) ou 'ambos'.
  const ITENS = [
    { id: 'optMunicipal', finalidade: 'federal', nome: 'Atendimentos e absenteísmo', indicadores: 'C1 e Q14.2.1', escopo: 'municipio',
      fonte: 'Relatórios gerenciais de atendimentos e de absenteísmo do PEC.',
      como: 'Uma consulta para o município inteiro, com a competência escolhida; exige acesso com permissão municipal.',
      sai: 'Totais por unidade, equipe e tipo de atendimento. A C1 é do cofinanciamento federal; o Q14.2.1 (absenteísmo) é acompanhamento municipal.', pessoal: SO_TOTAIS },
    { id: 'optEscuta', finalidade: 'federal', nome: 'Escuta inicial na C1', indicadores: 'C1', escopo: 'unidade',
      fonte: 'Relatório de atendimento individual de cada unidade, filtrado pela escuta inicial.',
      como: 'Uma passada por unidade; é a parte mais demorada da C1.', sai: 'Quantidade de atendimentos com escuta por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC2', finalidade: 'federal', nome: 'C2 · Desenvolvimento infantil', indicadores: 'C2', escopo: 'unidade',
      fonte: 'Relatório de condições de saúde do PEC (crianças vinculadas às equipes eSF/eAP).',
      como: 'Uma passada por unidade, uma leitura por equipe.', sai: 'Numerador, denominador e pontos por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC3', finalidade: 'federal', nome: 'C3 · Gestante e puérpera', indicadores: 'C3, S3, S4, S20', escopo: 'unidade',
      fonte: 'Relatório de condições de saúde · gestação e puerpério.', como: 'Uma passada por unidade, uma leitura por equipe.',
      sai: 'Numerador, denominador e pontos por equipe (a S3, a S4 e a S20 saem da mesma leitura).', pessoal: SO_TOTAIS },
    { id: 'optC4', finalidade: 'federal', nome: 'C4 · Diabetes', indicadores: 'C4', escopo: 'unidade',
      fonte: 'Relatório de condições de saúde · diabetes.', como: 'Uma passada por unidade.', sai: 'Numerador, denominador e pontos por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC5', finalidade: 'federal', nome: 'C5 · Hipertensão', indicadores: 'C5', escopo: 'unidade',
      fonte: 'Relatório de condições de saúde · hipertensão.', como: 'Uma passada por unidade.', sai: 'Numerador, denominador e pontos por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC6', finalidade: 'federal', nome: 'C6 · Pessoa idosa', indicadores: 'C6', escopo: 'unidade',
      fonte: 'Relatório de condições de saúde · pessoa idosa.', como: 'Uma passada por unidade.', sai: 'Numerador, denominador e pontos por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC7', finalidade: 'federal', nome: 'C7 · Saúde da mulher (itens A, B e D)', indicadores: 'C7-A, C7-B, C7-D', escopo: 'unidade',
      fonte: 'Relatórios de condições de saúde da mulher e de vacinação (HPV).', como: 'Uma passada por unidade.', sai: 'Numerador e denominador de cada item, por equipe.', pessoal: SO_TOTAIS },
    { id: 'optC7C', finalidade: 'federal', nome: 'C7 · Item C (saúde sexual e reprodutiva)', indicadores: 'C7-C', escopo: 'unidade',
      fonte: 'Relatório de atendimento individual, equipe por equipe.', como: 'Lento: cerca de 1 minuto por equipe.', sai: 'Numerador e denominador do item C, por equipe.', pessoal: SO_TOTAIS },
    { id: 'optCvat', finalidade: 'federal', nome: 'CVAT · Vínculo e acompanhamento territorial', indicadores: 'CVAT, CVAT-CAD, CVAT-ACO', escopo: 'unidade',
      fonte: 'Cidadãos vinculados, imóveis e visitas domiciliares de cada equipe.', como: 'Uma passada por unidade, lendo vinculados, imóveis e visitas de cada equipe.',
      sai: 'Numerador e denominador do cadastro e do acompanhamento, por equipe.', pessoal: SO_TOTAIS },
    { id: 'optBucal', finalidade: 'federal', nome: 'Odontologia · B1, B2, B3, B5, B6', indicadores: 'B1, B2, B3, B5, B6', escopo: 'unidade',
      fonte: 'Relatório de atendimento odontológico das equipes eSB.', como: 'Uma passada por unidade.', sai: 'Numerador e denominador por equipe.', pessoal: SO_TOTAIS },
    { id: 'optB4', finalidade: 'federal', nome: 'Odontologia · B4 (escovação supervisionada)', indicadores: 'B4', escopo: 'ambos',
      fonte: 'Atividades coletivas registradas no PEC.', como: 'Lê as atividades do município e, por unidade, as equipes eSB; alguns minutos.',
      sai: 'Por equipe: crianças de 6 a 12 anos identificadas, participações, atividades e os totais da conferência (sem documento, maior atividade, criança em mais de uma equipe).',
      pessoal: 'Só totais. Para seguir a nota B4, a extensão lê o CPF e o CNS do participante apenas para conferir os dígitos verificadores, na memória do navegador; o número é descartado na hora e nunca é guardado nem enviado.' },
    { id: 'optEmulti', finalidade: 'federal', nome: 'eMulti · M1 e M2', indicadores: 'M1, M2', escopo: 'ambos',
      fonte: 'Lista de atendimentos (atendimentos compartilhados) e atividades coletivas das equipes eMulti.',
      como: 'Uma leitura no município e uma passada por unidade; alguns minutos.', sai: 'Atendimentos, atividades e quantidade de pessoas diferentes atendidas, por equipe.',
      pessoal: 'Para contar pessoas diferentes, a extensão lê o identificador interno do cidadão e calcula um resumo irreversível com um sal sorteado a cada coleta. O resumo fica só na memória e é descartado ao fim da coleta; ao Painel vão apenas as contagens. Por isso não é possível acompanhar a mesma pessoa de um mês para outro.' },
    { id: 'optCR', finalidade: 'federal', nome: 'Consultório na Rua · CR1 a CR4', indicadores: 'CR1, CR2, CR3, CR4', escopo: 'unidade',
      fonte: 'Relatórios da equipe eCR (a CR4 usa o atendimento individual filtrado por tuberculose).', como: 'Uma passada por unidade; só roda onde há equipe eCR.', sai: 'Numerador e denominador por equipe.', pessoal: SO_TOTAIS },
    { id: 'optVacinas', finalidade: 'estadual', nome: 'Vacinas · doses aplicadas', indicadores: 'Estimativa do cofinanciamento estadual', escopo: 'municipio',
      fonte: 'Relatório gerencial de vacinação do PEC (imunobiológico, faixa etária e dose).',
      como: 'Uma consulta por mês para o município inteiro (o relatório não tem unidade).',
      sai: 'Doses de pólio, penta, pneumo 10, tríplice viral e HPV por faixa etária e dose. Servem de estimativa ao lado do valor oficial, que é lançado à mão.', pessoal: SO_TOTAIS },
    { id: 'optTerritorio', finalidade: 'municipal', nome: 'Território', indicadores: 'TERR-ATU, TERR-COMP, TERR-VIS, TERR-FA', escopo: 'unidade',
      fonte: 'Imóveis, cadastro e visitas por microárea.', como: 'Uma passada por unidade.', sai: 'Imóveis atualizados, cadastro completo e visitas por microárea.', pessoal: SO_TOTAIS },
    { id: 'optFilas', finalidade: 'municipal', nome: 'Filas e faltas · faltas, atendimentos e próxima vaga', indicadores: 'Painel de filas e faltas', escopo: 'ambos',
      fonte: 'Gerenciais de absenteísmo e de atendimentos (município) e agenda de cada médico e enfermeiro (por unidade).',
      como: 'Faltas e atendimentos vêm do município de uma vez; a próxima vaga vem da agenda de cada profissional, olhando o mês atual e os três seguintes.',
      sai: 'Por profissional: nome, cargo, equipe, faltas, atendimentos e dias até a próxima vaga.', pessoal: 'Totais por profissional (nome e cargo de médicos e enfermeiros). Nenhum dado de paciente. Só administradores e gestores veem esta tela.' },
    { id: 'optFilasHora', finalidade: 'municipal', nome: 'Filas e faltas · faltas por horário', indicadores: 'Painel de filas e faltas', escopo: 'unidade',
      fonte: 'Agenda do mês de cada médico e enfermeiro com agenda ativa.', como: 'Uma consulta por profissional; de cada agendamento vêm só o horário, a situação e o tipo.',
      sai: 'Grade por dia da semana e hora: agendados, atendidos e faltas.', pessoal: 'Totais por profissional e horário. Nenhum dado de paciente.' },
    { id: 'optComposicao', finalidade: 'municipal', nome: 'Composição das equipes', indicadores: 'Árvore município › unidade › equipe › profissional', escopo: 'unidade',
      fonte: 'Quadro de lotações da unidade, no relatório clássico do PEC.', como: 'Uma passada por unidade. Coletas parciais se somam às unidades já recebidas no mês.',
      sai: 'Unidades, equipes, nome e cargo de cada profissional e avisos (por exemplo, profissional em mais de uma equipe).', pessoal: 'Nome e cargo dos profissionais. Nenhum dado de paciente.' }
  ];
  const API = { SO_TOTAIS, FINALIDADES, ITENS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.EXTRACAO = API;
})(typeof self !== 'undefined' ? self : this);
