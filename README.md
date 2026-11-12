# Painel APS

O **Painel APS** é a Plataforma de Indicadores da Atenção Primária da Secretaria de Saúde de Cajamar (repositório `plataforma-indicadores-aps`). Endereço previsto: `https://painelaps.pages.dev`.

Ela recebe as coletas mensais feitas pela extensão do Chrome no PEC e-SUS APS, guarda o histórico e, nas próximas fases, mostra os painéis (dashboards) por município, unidade e equipe.

```
PEC e-SUS ──► extensão do Chrome ──► API (Cloudflare Pages Functions) ──► banco D1
                                          │                         │
                          painel de indicadores (fase 2)     backup mensal no Google Drive
```

## Privacidade

- O banco guarda **apenas totais** por unidade e equipe: contagens, numeradores, denominadores e pontuações.
- Nenhum nome, CPF, CNS, endereço ou telefone de paciente chega à plataforma. A pontuação de cada pessoa é calculada na memória do navegador e descartada.
- As chaves de acesso ficam como *secrets* no Cloudflare, nunca neste repositório.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `api/` | Lógica do servidor: rotas, login, validação, gravação por etapa, backup e restauração |
| `functions/` | Ponto de entrada do Cloudflare Pages (`_middleware.js` chama `api/index.js` em todo pedido) |
| `migrations/` | Estrutura do banco D1 (SQL) |
| `painel/` | Páginas: entrada (`entrar.html`), painel de notas (`index.html`), composição das equipes (`composicao.html`), usuários e troca de senha |
| `backup/` | Script do Google Apps Script que faz o backup mensal no Google Drive |
| `test/` | Testes automáticos (Node 22+, sem dependências externas) |

## Como a coleta é gravada

A extensão divide cada coleta em **etapas** independentes: cada lista de cada equipe, cada relatório gerencial e a escuta inicial de cada equipe e categoria. Cada etapa é enviada assim que termina.

- **Gravação atômica:** cada etapa entra inteira ou não entra.
- **Idempotente:** reenviar a mesma etapa substitui os dados dela, sem duplicar.
- **Falha não apaga:** uma etapa enviada como `falhou` nunca apaga dados bons já gravados para ela.
- **Versão vigente:** para cada etapa de uma competência, vale a **última leitura bem-sucedida** (view `etapa_vigente`). Uma nova tentativa, uma coleta avulsa ou a recoleta dos relatórios gerenciais depois do 10º dia substituem a anterior. O histórico continua guardado.
- **Data da leitura:** cada etapa registra `coletado_em`. Isso importa para as listas do PEC, que mostram a situação do dia em que são lidas.

Chaves de etapa usadas pela extensão:

| Chave | Conteúdo |
|---|---|
| `gerencial:atendimentos` | Totais de atendimentos por unidade, equipe, CBO e tipo (C1, Q14.2.1) |
| `gerencial:absenteismo` | Faltas por unidade, equipe, CBO e tipo de falta (Q14.2.1) |
| `vinculados:<INE>` | Pessoas vinculadas à equipe (Q12.2) |
| `lista:<tema>:<INE>` | Listas temáticas: `gestantes` (C3, S3, S4, S20), `criancas` (C2), `idosos` (C6), `diabetes` (C4), `hipertensao` (C5), `geral` (CR1) |
| `escuta:<INE>:<CATEGORIA>` | Escuta inicial da equipe por categoria (C1) |

Nas listas de gestantes e crianças, cada indicador pode vir em dois recortes: `situacao` (quem está ativo na competência) e `desfecho` (quem fechou o puerpério ou completou 2 anos na competência). O resultado quadrimestral da C2 e da C3 usa só os meses com desfecho (Nota Técnica nº 8/2026-DEAPS/SAPS/MS).

## API

Todas as rotas ficam sob `/api/v1`. As rotas de leitura aceitam a chave da extensão (`Authorization: Bearer <chave>`) ou a sessão de um usuário logado; as de gravação, backup e restauração exigem a chave.

| Método e rota | Chave | Uso |
|---|---|---|
| `GET /saude` | — | Verificação de funcionamento |
| `POST /auth/entrar` · `POST /auth/sair` | — | Login por usuário e senha; grava ou apaga o cookie de sessão |
| `GET /auth/eu` · `POST /auth/senha` | sessão | Quem está logado; troca de senha |
| `GET /auth/config` | — | Se a entrada pelo Apoio está ligada |
| `PUT /composicao` | coleta | Composição das equipes de uma competência (árvore unidade → equipe → profissionais, com os pontos de atenção) |
| `GET /composicao?competencia=AAAA-MM` | coleta ou sessão | Composição mais recente (ou da competência) e a lista de competências |
| `GET /usuarios` · `POST /usuarios` · `PATCH /usuarios/:id` | sessão de admin ou `TOKEN_ADMIN` | Administração de usuários |
| `POST /coletas` | coleta | Abre uma coleta `{ id, competencia, tipo, versaoExtensao, iniciadoEm, config }` |
| `PUT /coletas/:id/etapa` | coleta | Grava ou regrava uma etapa (exemplo abaixo) |
| `POST /coletas/:id/concluir` | coleta | Encerra a coleta: `{ status: "concluida" \| "parcial" \| "cancelada" }` |
| `GET /coletas?competencia=AAAA-MM` | coleta | Lista as coletas |
| `GET /coletas/:id/etapas` | coleta | Etapas de uma coleta |
| `GET /situacao?competencia=AAAA-MM` | coleta | Situação de cada etapa: vigente ou pendente (usada para "tentar de novo as falhas") |
| `GET /dados?competencia=AAAA-MM` | coleta | Indicadores e totais vigentes da competência |
| `GET /competencias` | coleta | Competências com coleta |
| `GET /backup/manifesto` | backup | Versão do esquema, última alteração e contagens |
| `GET /backup/tabela/:nome?depois=&limite=` | backup | Uma página de uma tabela (até 5.000 linhas) |
| `POST /restauracao/iniciar` | admin | Apaga tudo para restaurar; exige `{ "confirmar": "APAGAR E RESTAURAR", "versaoEsquema": 1 }` |
| `POST /restauracao/tabela/:nome` | admin | Insere uma parte `{ linhas: [...] }` |
| `POST /restauracao/concluir` | admin | Confere as contagens `{ contagens: {...} }` |

Exemplo de etapa:

```json
{
  "chave": "lista:gestantes:0002104741",
  "bloco": "gestantes",
  "unidade": "UBS Dra Izabel Gratieri",
  "equipe": "EQUIPE PANORAMA",
  "ine": "0002104741",
  "tipoEquipe": "ESF",
  "status": "ok",
  "tentativas": 1,
  "coletadoEm": "2026-11-03T10:05:00Z",
  "linhas": [
    { "codigo": "C3", "recorte": "situacao", "unidade": "UBS Dra Izabel Gratieri", "equipe": "EQUIPE PANORAMA",
      "ine": "0002104741", "tipoEquipe": "ESF", "denominador": 38, "somaPontos": 1227, "excluidos": 17,
      "itens": { "A": 30, "B": 22 } }
  ],
  "cubos": { "atendimentos": [], "absenteismo": [], "escuta": [] },
  "avisos": ["2 registros sem DUM"]
}
```

Os campos de uma linha que a API não conhece são guardados em `extras`.

### Chaves de acesso

| Secret | Quem usa | O que permite |
|---|---|---|
| `TOKEN_COLETA` | Extensão do Chrome | Enviar coletas e ler a situação e os dados |
| `TOKEN_BACKUP` | Script de backup no Google Drive | Somente leitura do backup |
| `TOKEN_ADMIN` | Administração | Tudo, inclusive restaurar |

Use chaves longas e aleatórias, com pelo menos 32 caracteres. Uma chave não configurada nunca autentica.

## Composição das equipes

A página `/composicao` mostra um fluxograma que abre do macro ao micro: município → unidade → equipe → categoria profissional → profissional. Cada cartão traz um selo com os pontos de atenção daquele nível e dos níveis abaixo (equipe sem médico, eSB sem vínculo, ACS sem equipe etc.). Dá para buscar, ver só o que tem ponto de atenção e trocar a competência.

Os dados vêm da extensão (opção "Composição das equipes"), que lê o quadro de lotação de cada unidade no PEC e envia a árvore pronta por `PUT /api/v1/composicao`. Enquanto nada foi enviado, a página mostra um exemplo fictício. A tabela `composicao` não entra no backup do Drive: a extensão recoleta a cada mês.

## Acesso (login)

Só a página `/entrar` e os arquivos visuais são públicos; todo o resto passa pelo `functions/_middleware.js` e exige login.

- **Usuário e senha do Painel APS.** Senha guardada como resumo PBKDF2-SHA256 (100.000 iterações, sal por usuário). Sessão de 12 horas no cookie `__Host-painelaps` (HttpOnly, Secure, SameSite=Lax); o banco guarda só o resumo do código da sessão.
- **Tentativas:** 5 erros por usuário ou 30 por IP a cada 15 minutos bloqueiam novas tentativas até a janela passar.
- **Primeiro acesso:** a senha provisória obriga a pessoa a criar a própria senha (mínimo de 10 caracteres, letras e números, sem o nome de usuário).
- **Perfis:** `admin` (tudo, inclusive usuários), `gestor` e `leitor` (painéis). A sessão só lê dados; gravar coletas continua exclusivo da chave da extensão.
- **Usuários:** a página `/usuarios` (só administradores) cria, redefine senha, muda perfil e desativa. Desativar ou redefinir encerra as sessões da pessoa na hora. O sistema não deixa ficar sem administrador ativo.
- **Backup:** as tabelas de usuários e sessões **não** vão para o backup do Drive. Se o banco for restaurado do zero, recrie o primeiro administrador.

### Primeiro administrador

Depois de publicar e configurar `TOKEN_ADMIN`:

```bash
curl -X POST https://painelaps.pages.dev/api/v1/usuarios \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"login":"herbet.santos","nome":"Herbet Santos","perfil":"admin"}'
```

A resposta traz `senhaProvisoria`. Entre em `/entrar` com ela e crie a sua senha. Os demais usuários se criam pela página `/usuarios`.

### Integração com o login do Apoio

O botão "Entrar com o login do Apoio" usa o código de uso único que o Apoio (`atencaoprimaria.apoiosaude.workers.dev`) já gera para o eMulti. O Painel APS troca o código pela identidade em `POST /api/handoff/consume` do Apoio e **só deixa entrar quem já está cadastrado e ativo** em `/usuarios` (o login do Painel APS precisa ser igual ao usuário do Apoio).

Para ligar:

1. **No Apoio** (`public/login.html`): incluir `'painelaps.pages.dev'` em `ALLOWED_NEXT_HOSTS`.
2. **No Painel APS** (Pages → Settings → Variables and secrets): criar o secret `APOIO_CHAVE` com o **mesmo valor** de `EMULTI_HANDOFF_SECRET` do projeto do Apoio. A variável `APOIO_RESGATE_URL` já vem preenchida no `wrangler.jsonc`.
3. **Quem entra:** o Apoio só emite o código para quem tem a permissão `eMulti | Regulação` (`regulacao_vagas`). Para separar o acesso do Painel APS, o Apoio precisaria de uma permissão própria (ex.: `indicadores_aps`), mudança que fica para depois.

**Administrador:** quem é `super_admin` no Apoio entra no Painel APS como administrador (o usuário é criado ou promovido na hora, e fica registrado em `registro_acesso`). Para mudar quais perfis valem, use a variável `APOIO_PERFIS_ADMIN` (separados por vírgula; vazio desliga a regra). Os demais perfis do Apoio só entram se já estiverem cadastrados.

Sem o secret `APOIO_CHAVE`, o botão não aparece e o login por usuário e senha segue funcionando.

## Publicação (Cloudflare Pages)

O Painel APS é um projeto do **Cloudflare Pages** chamado `painelaps`, no endereço **https://painelaps.pages.dev**. As páginas ficam em `painel/` e o servidor roda como *Pages Functions* (`functions/_middleware.js`).

1. **Banco:** em *Storage & Databases → D1*, crie o banco `indicadores-aps`, coloque o ID dele em `wrangler.jsonc` (`database_id`) e aplique as migrações (`npm run migrar`, ou cole o conteúdo de cada arquivo de `migrations/` no console do D1, em ordem).
2. **Projeto:** em *Workers & Pages → Create → Pages → Connect to Git*, escolha este repositório. Nome do projeto: `painelaps`. *Framework preset:* nenhum. *Build command:* vazio. *Build output directory:* `painel`. Cada envio para `main` publica de novo.
3. **Banco no projeto:** o `wrangler.jsonc` já liga o banco como `DB`. Se o painel não ler o arquivo, ligue em *Settings → Bindings → D1 database*, nome `DB`.
4. **Chaves:** em *Settings → Variables and Secrets*, crie `TOKEN_COLETA`, `TOKEN_BACKUP` e `TOKEN_ADMIN` como *Secret* (e `APOIO_CHAVE`, quando ligar a integração), em *Production*.
5. **Primeiro administrador:** veja *Acesso (login)*.
6. **Conferência:** abra `https://painelaps.pages.dev/api/v1/saude`. A resposta deve ser `{"ok":true,"servico":"painelaps",...}`.

Alternativa sem Git: `npx wrangler pages deploy` (publica a pasta `painel` com as funções).

**Limite de CPU no plano gratuito:** o login usa 100.000 iterações do PBKDF2. Se o login falhar com o erro 1102 (excesso de CPU), crie a variável `SENHA_ITERACOES` com `50000`; as senhas já criadas continuam valendo.

Mudanças no banco entram sempre como um novo arquivo em `migrations/` (`0002_...sql`). Arquivos já aplicados nunca são editados.

## Backup no Google Drive

O arquivo `backup/backup-drive.gs` roda no Google Apps Script, na conta dona da pasta de backup:

- **Quando:** todo dia 10, às 6h.
- **O que faz:** baixa o banco inteiro pela chave de backup, confere as contagens e salva `AAAA-MM-DD_HHmm_indicadores-aps.json.gz` na pasta. Depois reabre o arquivo e confere o conteúdo.
- **Avisos por e-mail:** quando o backup falha e quando a coleta do mês anterior ainda não entrou no banco.
- **Arquivos:** todos ficam guardados, sem rodízio. São pequenos: cerca de 250 KB compactados por ano de coletas, ou 9 MB sem compactar.
- **Limite de tamanho:** o Apps Script trabalha com arquivos de até cerca de 50 MB em memória. Pelo volume atual, isso leva vários anos. O script avisa por e-mail quando o backup passa de 30 MB sem compactar, e aí o backup deve ser dividido por ano.

A instalação está no começo do arquivo (propriedades `API_URL`, `TOKEN_BACKUP`, `PASTA_ID` e, se quiser, `EMAIL_ALERTA`; depois execute `instalarAgendamento()`).

**Restauração:** crie temporariamente as propriedades `TOKEN_ADMIN`, `RESTAURAR_ARQUIVO_ID` e `RESTAURAR_CONFIRMO = APAGAR E RESTAURAR` e execute `restaurarBackup()`. Os dados atuais são substituídos pelos do arquivo, e as três propriedades são apagadas ao final. Vale testar a restauração de vez em quando num banco de teste.

Proteção em camadas:

- **Durante a coleta:** a cópia local na extensão.
- **Erros recentes:** a restauração do próprio D1 (*Time Travel*, 7 dias no plano gratuito).
- **Longo prazo:** os arquivos no Drive.

## Desenvolvimento

```bash
npm test        # testes da API e do script de backup (Node 22+, sem instalar nada)
npm run dev     # API local com o wrangler (requer npm install)
node test/servidor-local.mjs 8787 admin.local 'Senha#Local2026'   # páginas + API com banco em memória, sem instalar nada
```

Os testes usam o SQLite embutido no Node para imitar o D1 (`test/d1-local.mjs`). O script de backup também é testado de ponta a ponta: backup, conferência, aviso e restauração num banco vazio.

## Fases

1. **Base (esta):** banco, API, backup no Drive e extensão enviando por etapa.
2. **Painel:** login próprio e integração com o Apoio (feito); painel de notas por município, unidade e equipe, ligado aos dados reais (o painel ainda mostra valores fictícios).
3. **Fontes externas e novos indicadores:** absenteísmo de exames, internações, CVAT, cobertura potencial; saúde bucal, eMulti e C7.
4. **Inteligência:** alertas de mudança de faixa, tendência em relação à meta, rankings e resumo mensal.

## Comunicados internos

O administrador publica avisos em `/comunicados` (título, texto, destinatários, importância e período opcional). Cada usuário vê uma faixa no topo das páginas até marcar "Entendi"; o administrador vê quantos já leram. Requer a migração `migrations/0004_comunicados.sql`.

## Monitoramento das coletas

`/monitoramento` (só administradores) confere se a coleta do PEC e a composição chegaram no prazo (`MONITOR_DIAS`, padrão 40), quais etapas falharam e o que a extensão não identificou. Quando há problema, a tela inicial mostra um aviso aos administradores.
