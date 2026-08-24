/**
 * Traduz o que o servidor devolve para algo que cabe numa tela.
 *
 * O PostgREST não rejeita com `Error`: ele rejeita com um objeto simples,
 * `{ code, message, details, hint }`. Quem fazia `String(e)` para exibir
 * recebia de volta a string "[object Object]" — o usuário via uma caixa
 * vermelha que não dizia nada e não tinha como saber se a ação funcionou.
 *
 * O caso mais comum aqui é o 42501: a sessão do Supabase acabou, mas o
 * aparelho ainda tem o apelido salvo e continua se mostrando conectado. Toda
 * chamada vira "permission denied" porque sai como anônimo. Isso não é um erro
 * de rede nem de digitação, é sessão vencida — e a mensagem tem que dizer
 * exatamente isso, senão a pessoa fica tentando de novo para sempre.
 */

/** Formato do erro do PostgREST. */
interface ErroServidor {
  message?: unknown;
  code?: unknown;
}

function comoObjeto(e: unknown): ErroServidor | null {
  return typeof e === 'object' && e !== null ? (e as ErroServidor) : null;
}

/** Código do erro do servidor, quando existir. */
export function codigoDoErro(e: unknown): string | null {
  const obj = comoObjeto(e);
  return typeof obj?.code === 'string' ? obj.code : null;
}

/**
 * A sessão acabou ou nunca existiu — a chamada saiu como anônima.
 *
 * `42501` é o "permission denied" do Postgres, que é o que sobra quando o
 * `authenticated` não está no token. Os `PGRST30x` são o JWT ausente,
 * malformado ou vencido.
 */
export function ehSessaoVencida(e: unknown): boolean {
  const code = codigoDoErro(e);
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') return true;

  const msg = comoObjeto(e)?.message;
  return typeof msg === 'string' && /\bJWT\b|not authenticated|precisa estar autenticado/i.test(msg);
}

/**
 * As frases que a tela usa no lugar do texto do banco.
 *
 * Traduzidas no app, e não no Postgres, por duas razões. A primeira é idioma:
 * a mensagem do banco existe em português só, e quem usa o app em inglês
 * receberia uma frase que não sabe ler. A segunda apareceu na prática — o
 * texto das exceções foi gravado no banco com o acento corrompido, e a tela
 * mostrava "nÃ£o achei ninguÃ©m". Repassar texto de servidor para a interface
 * é entregar a uma pessoa algo escrito para um log.
 */
export interface Frases {
  sessaoVencida: string;
  naoAchei: string;
  voceMesmo: string;
  semRede: string;
  /** Para o que o app não sabe explicar e o servidor não soube dizer direito. */
  generico: string;
}

/**
 * O texto das exceções foi gravado no banco com o acento corrompido — "nÃ£o"
 * no lugar de "não". Os códigos conhecidos já não passam por aqui, mas um
 * código novo passaria, e mostrar isso para alguém é pior do que não mostrar
 * nada. A assinatura da corrupção é o Ã seguido de outro caractere alto.
 */
function textoIlegivel(msg: string): boolean {
  // Comparado por codigo, e nao por uma expressao regular com os caracteres
  // escritos: assim este arquivo nao depende do proprio encoding para
  // funcionar. 0xC3 e 0xC2 seguidos de um byte de continuacao sao o que
  // sobra quando um texto UTF-8 e lido como Latin-1.
  for (let i = 0; i < msg.length - 1; i++) {
    const alto = msg.charCodeAt(i);
    const seguinte = msg.charCodeAt(i + 1);
    if ((alto === 0xc3 || alto === 0xc2) && seguinte >= 0x80 && seguinte <= 0xbf) {
      return true;
    }
  }
  return false;
}

/** Códigos que o app sabe explicar sozinho. */
const CONHECIDOS: Record<string, keyof Frases> = {
  P0002: 'naoAchei',   // find_player não retornou ninguém
  '22023': 'voceMesmo', // o alvo do pedido é a própria conta
};

/** Uma frase legível para qualquer coisa que tenha sido lançada. */
export function mensagemDeErro(e: unknown, frases: Frases): string {
  if (ehSessaoVencida(e)) return frases.sessaoVencida;

  const code = codigoDoErro(e);
  const conhecido = code ? CONHECIDOS[code] : undefined;
  if (conhecido) return frases[conhecido];

  // Falha de rede chega como TypeError do fetch, sem código nem corpo.
  if (e instanceof TypeError) return frases.semRede;

  const msg = typeof e === 'string'
    ? e
    : e instanceof Error ? e.message : comoObjeto(e)?.message;
  if (typeof msg === 'string' && msg.trim()) {
    return textoIlegivel(msg) ? frases.generico : msg;
  }

  return frases.generico;
}
