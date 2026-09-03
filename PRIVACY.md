# Privacidade

Este documento descreve exatamente o que o Open-Tracker-TCG faz com dados. Ele vale para o código deste repositório; um build de terceiro pode ter sido alterado.

## Três coisas diferentes

O app faz afirmações sobre privacidade que costumam ser confundidas. Elas são independentes.

### 1. A inferência é local, sem exceção

O modelo de linguagem roda no aparelho, via `llama.rn`. Não há servidor de inferência.

Nunca saem do aparelho, em nenhuma configuração:

- gravações de áudio
- transcrições
- o texto livre que você digita
- o campo de notas de qualquer partida

Isso não tem toggle porque não existe destino para onde enviar. O único tráfego de rede relacionado à IA é o download do modelo, do Hugging Face, uma vez.

### 2. Resultados anônimos, ligados por padrão

Para montar um retrato agregado do metagame, o app envia o resultado de cada partida salva. **Vem ligado**, é apresentado no passo 4 do onboarding e pode ser desligado ali mesmo ou em Configurações → Privacidade.

#### O que é enviado

| Campo | Exemplo | Por quê |
|---|---|---|
| `format` | `Commander` | Separar metas |
| `archetype` | `Aggro` | Arquétipo do oponente |
| `my_deck` / `opp_deck` | `Atraxa` | Confronto entre decks |
| `on_play` | `true` | Medir a vantagem de começar |
| `won` / `drew` | `false` / `true` | Resultado |
| `played_week` | `2026-W33` | Evolução ao longo do tempo |
| `app_version` | `1.0.0` | Separar mudanças de comportamento entre versões |
| `install_id` | UUID | Deduplicar e evitar que um aparelho muito ativo distorça o agregado |
| `event_id` | UUID | Idempotência: reenviar um lote não duplica linha |

#### O que não é enviado

Voz · transcrição · notas · nome · e-mail · conta · **data e hora exatas** (só a semana ISO) · localização · identificador de publicidade · lista de contatos · qualquer identificador de aparelho fornecido pelo sistema.

#### Sobre o `install_id`

É um UUID v4 sorteado na primeira execução e guardado localmente. Ele identifica **uma instalação**, não uma pessoa: não vem do sistema operacional, não é estável entre reinstalações e não se conecta a nenhuma conta.

Ele existe por dois motivos concretos: deduplicar reenvios, e permitir que a análise conte aparelhos distintos — sem isso, uma pessoa que registra 300 partidas com o mesmo deck pareceria um metagame inteiro.

Apagar os dados do app (Configurações → Apagar tudo, ou desinstalar) descarta o `install_id`. Uma instalação nova sorteia outro, sem ligação com o anterior.

## Fila local e opt-out

Eventos são acumulados localmente e enviados em lote quando há conexão. Isso significa que pode existir, por um tempo, algo pendente no aparelho.

Desligar o compartilhamento **descarta a fila imediatamente**, sem tentar enviá-la antes. Configurações mostra quantos eventos estão pendentes enquanto o compartilhamento está ligado.

### 3. Conta e amigos — opcional

Amigos, locais compartilhados e confirmação de partida exigem uma **conta**. Ela é criada só quando você quer, em Configurações → Conta. Sem criar, nada disso existe e o app funciona inteiro: dá para anotar oponente por apelido e local do tipo casa sem servidor nenhum.

A conta é **e-mail, apelido e senha**, criados dentro do app. O apelido é único e público — é por ele, ou pelo e-mail, que um amigo manda pedido para você.

**O e-mail não é verificado.** Ele serve para entrar e para ser encontrado, não como prova de que o endereço é seu. Isso é uma decisão consciente de produto, e tem uma consequência que você precisa conhecer: alguém pode se cadastrar com um e-mail que não é dele e receber os pedidos de amizade destinados ao dono daquele endereço. Se isso passar a importar, o caminho é ligar a confirmação de e-mail no Supabase.

#### O que a conta guarda no servidor

| Guarda | Não guarda |
|---|---|
| e-mail e senha (com hash, pelo Supabase Auth) | seu nome real |
| o apelido que **você** escolheu para si | sua agenda, contatos ou redes |
| de quem você é amigo e pedidos pendentes | localização |
| partidas aguardando confirmação | seu histórico de partidas |

O histórico de partidas continua **só no aparelho**. A conta é identidade, não armazenamento: nem os decks, nem as partidas, nem as estatísticas são enviados para o servidor por causa dela.

#### Confirmação de partida

Ao salvar uma partida contra um oponente **vinculado**, o app manda para ele o mesmo evento anônimo de sempre, mais o id do local. Ele confirma ou contesta.

Quando ele confirma, a partida entra na base de meta marcada como **verificada** — e os ids dos dois jogadores **ficam para trás**. A base analítica registra que a partida foi verificada, nunca por quem. Isso está no `resolve_claim` em [`supabase/schema_social.sql`](supabase/schema_social.sql), não na política.

Contestada, ou sem resposta, ela fica só no seu aparelho.

#### Locais

Loja, evento e online vão para uma base compartilhada, para que a próxima pessoa ache em vez de criar de novo. **Local do tipo "casa" nunca sai do aparelho** — é endereço residencial de alguém. Isso é garantido por constraint no banco, não só pelo app: um cliente com defeito também não consegue.

Não há rastreamento de localização. A cidade que você digita serve para ordenar a busca de locais e fica no aparelho.

#### Desligar

Sair da conta encerra a sessão e transforma todos os oponentes vinculados em oponentes locais. O histórico continua intacto no aparelho.

## Como os dados ficam armazenados

Em uma tabela Postgres no Supabase, com Row Level Security ligada e uma única policy: a chave pública do app pode inserir, e nada mais. Ela não lê, não altera e não apaga. O esquema completo está em [`supabase/schema.sql`](supabase/schema.sql).

As views de análise (`meta_by_deck`) só expõem combinações vistas por **5 aparelhos ou mais**. Agregar grupos pequenos demais é justamente o que permite reidentificação.

## Se você clonar este repositório

Sem `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`, nenhuma requisição de telemetria é feita — a função de envio retorna cedo. A tela de Configurações informa que o build não tem servidor configurado.

## Seus dados locais

Ficam em `AsyncStorage`, no armazenamento privado do app. Exporte para CSV em Configurações → Exportar. Apague tudo em Configurações → Apagar todos os dados.

## Contato

Encontrou divergência entre este documento e o comportamento do código? Abra uma issue com a etiqueta `privacy` — é tratada com prioridade.
