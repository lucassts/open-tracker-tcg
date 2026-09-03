# Open-Tracker-TCG

Registro de partidas de card game para Android. Você conta como foi a partida em voz alta, um modelo de linguagem rodando **no próprio aparelho** transforma isso em dados, e as estatísticas aparecem sem você preencher formulário.

### [⬇ Baixar o APK](https://github.com/lucassts/open-tracker-tcg/releases/latest/download/open-tracker-tcg.apk)

Esse link aponta sempre para a versão mais recente. As anteriores ficam em [Releases](https://github.com/lucassts/open-tracker-tcg/releases).

> Como o app não está na Play Store, o Android pede autorização para instalar de "fontes desconhecidas" na primeira vez.

---

## O que ele faz

**Registrar a partida.** Segure o microfone e conte o que aconteceu, digite em texto livre, ou preencha o formulário. A tela de revisão mostra o que a IA entendeu, campo a campo, antes de salvar.

**Marcar os games.** O resultado não é digitado: você toca em quem levou cada um dos três games, e o placar decide — 2×1 e 1×0 são vitória, 1×1 é empate.

**Acompanhar.** Win rate, evolução no tempo, quem começa contra quem saca, desempenho por deck, por versão de deck, por arquétipo, por oponente e por local. Filtros por formato, resultado, período, deck e local, com uma imagem pronta para compartilhar.

**Contador de vida.** De 2 a 6 jogadores, com os layouts rotacionados para todo mundo ler de frente, e contadores de storm, mana, veneno, energia, experiência e dano de comandante.

**Decks e versões.** Cadastre seus decks, guarde a lista no formato do MTGO e compare o desempenho entre versões.

**Oponentes.** Um apelido já serve para acompanhar o confronto. Virando amigo — por apelido ou e-mail — o oponente pode **confirmar o resultado**, e só partida confirmada entra na base de meta como verificada.

Interface em português, inglês e japonês.

## Privacidade

Três coisas separadas, e vale não confundi-las:

1. **A IA é 100% local.** Áudio, transcrição e notas não saem do aparelho. Não é configurável porque não existe para onde enviar.
2. **Com conta, as partidas são sincronizadas**, para o histórico não se perder na troca de celular. Sem conta o app funciona inteiro, e aí nada sai do aparelho.
3. **Resultados anônimos são compartilhados por padrão** para montar um retrato do meta: formato, arquétipo, nomes de deck, resultado e a *semana* da partida. Não sai voz, notas, nome, data exata nem localização — e dá para desligar em Configurações.

Detalhes em [PRIVACY.md](PRIVACY.md).

## Como a IA funciona

O app roda **Qwen2.5-0.5B-Instruct Q4_K_M** (~350 MB) localmente, via [`llama.rn`](https://github.com/mybigday/llama.rn). O modelo é baixado do Hugging Face na primeira vez que você usa voz ou texto livre; o resto do app funciona antes disso, e dá para remover o modelo depois em Configurações.

Sem servidor de inferência, sem assinatura, sem anúncio.

## Rodar o projeto

Requer Node 20+ e o [ambiente Expo para desenvolvimento nativo](https://docs.expo.dev/get-started/set-up-your-environment/). O Expo Go não serve: o app usa um módulo nativo de terceiro (`llama.rn`) que entra como config plugin, e o Expo Go ignora plugins.

```bash
npm install
npx expo run:android    # development build
npm test                # testes das funções puras
npm run typecheck
bash check.sh           # APK de release
```

A parte de conta e amigos precisa de um projeto [Supabase](https://supabase.com): copie `.env.example` para `.env` e rode os arquivos de [`supabase/`](supabase/) no SQL Editor. Sem isso o app funciona igual, só com a parte social desligada.

Contribuições são bem-vindas — veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

React Native 0.81 · Expo SDK 54 · TypeScript · Zustand · React Navigation 6 · react-native-svg · llama.rn · Supabase · Jest

## Licença

[MIT](LICENSE).

Projeto independente, sem vínculo com a Wizards of the Coast ou qualquer outra publicadora. O app não distribui dados nem imagens de cartas: nomes de decks, formatos e cartas são digitados pelos próprios usuários. Fontes, modelo de IA e demais dependências estão creditados em [NOTICE.md](NOTICE.md).
