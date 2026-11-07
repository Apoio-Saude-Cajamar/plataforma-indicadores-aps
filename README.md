# plataforma-indicadores-aps

Plataforma de Indicadores da Atenção Primária da Secretaria de Saúde de Cajamar.

Ela recebe as coletas mensais feitas pela extensão do Chrome no PEC e-SUS APS, guarda o histórico e, nas próximas fases, mostra os painéis (dashboards) por município, unidade e equipe.

```
PEC e-SUS ──► extensão do Chrome ──► API (Cloudflare Worker) ──► banco D1
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
| `api/` | Worker do Cloudflare: rotas, validação, gravação por etapa, backup e restauração |
| `migrations/` | Estrutura do banco D1 (SQL) |
| `painel/` | Páginas do painel (por enquanto, só uma página de verificação) |
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

Todas as rotas ficam sob `/api/v1`. Com exceção de `/saude`, todas pedem o cabeçalho `Authorization: Bearer <chave>`.

| Método e rota | Chave | Uso |
|---|---|---|
| `GET /saude` | — | Verificação de funcionamento |
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

## Publicação

1. **Banco:** crie no Cloudflare um banco D1 chamado `indicadores-aps`, coloque o ID dele em `wrangler.jsonc` (`database_id`) e aplique as migrações (`npm run migrar`).
2. **Worker:** em *Workers & Pages → Create → Import a repository*, conecte este repositório. Comando de publicação: `npx wrangler deploy`. Cada envio para `main` publica de novo.
3. **Chaves:** em *Worker → Settings → Variables and Secrets*, crie `TOKEN_COLETA`, `TOKEN_BACKUP` e `TOKEN_ADMIN` como *Secret*.
4. **Conferência:** abra `https://<endereço-do-worker>/api/v1/saude`. A resposta deve ser `{"ok":true,...}`.

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
```

Os testes usam o SQLite embutido no Node para imitar o D1 (`test/d1-local.mjs`). O script de backup também é testado de ponta a ponta: backup, conferência, aviso e restauração num banco vazio.

## Fases

1. **Base (esta):** banco, API, backup no Drive e extensão enviando por etapa.
2. **Painel:** visão do município, detalhamento por unidade e equipe, série histórica, medidores com as faixas Regular, Suficiente, Bom e Ótimo, e login pelo Cloudflare Access.
3. **Fontes externas e novos indicadores:** absenteísmo de exames, internações, CVAT, cobertura potencial; saúde bucal, eMulti e C7.
4. **Inteligência:** alertas de mudança de faixa, tendência em relação à meta, rankings e resumo mensal.
