# Avisos de terceiros

## Wizards of the Coast

Magic: The Gathering é marca registrada da Wizards of the Coast LLC.

O Open-Tracker-TCG é um projeto independente. Não é produzido, endossado nem
afiliado à Wizards of the Coast, e não distribui dados de cartas, imagens de
cartas ou qualquer outra propriedade intelectual da empresa. O nome do app não
faz referência a nenhuma marca: ele registra partidas de card game em geral.

Os nomes de deck e de formato que aparecem no app são digitados pelos próprios
usuários, ou constam de uma lista de arquétipos populares mantida no
repositório — usada só como sugestão de digitação.

## Fontes

O app usa duas famílias tipográficas, instaladas como dependências npm
(`@expo-google-fonts/*`) e portanto travadas no `package-lock.json`:

- **Inter** — Rasmus Andersson, [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt)
- **JetBrains Mono** — JetBrains, [SIL Open Font License 1.1](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt)

O texto integral de cada licença acompanha o respectivo pacote, em
`node_modules/@expo-google-fonts/<família>/LICENSE_FONT`.

Só os quatro pesos de Inter e os dois de JetBrains Mono realmente usados são
importados, por subpath. Importar pelo índice do pacote arrastaria as ~40
variantes de cada família para dentro do bundle.

## Modelo de linguagem

O app baixa **Qwen2.5-0.5B-Instruct** (quantizado em GGUF Q4_K_M) do Hugging
Face na primeira execução. O modelo não é redistribuído aqui e permanece sob a
[licença Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/main/LICENSE)
da Alibaba Cloud.

A inferência usa [`llama.rn`](https://github.com/mybigday/llama.rn), MIT, que
por sua vez empacota [`llama.cpp`](https://github.com/ggerganov/llama.cpp), MIT.
