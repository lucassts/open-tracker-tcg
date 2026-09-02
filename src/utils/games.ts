/**
 * O resultado da partida deixa de ser digitado e passa a ser contado.
 *
 * Em Magic uma partida é melhor de três, e "vitória" é conclusão, não dado. A
 * pessoa sabe quem ganhou cada game; obrigá-la a converter isso em
 * vitória/derrota/empate joga fora a informação mais fina — 2x0 e 2x1 viravam
 * a mesma linha no histórico, e não são a mesma coisa.
 *
 * A regra de conversão é uma só: ganha quem levou mais games; empatou quem
 * levou o mesmo tanto. Ela cobre sozinha os casos que o Lucas descreveu —
 * 2x1 e 1x0 são vitória, 1x1 é empate — sem precisar de exceção para nenhum.
 */

/** Quem levou um game. `null` = o game não foi jogado. */
export type GameWinner = 'me' | 'opp' | null;

/** Sempre três posições, na ordem em que os games aconteceram. */
export type Games = [GameWinner, GameWinner, GameWinner];

export const GAMES_VAZIOS: Games = [null, null, null];

export interface Placar {
  me: number;
  opp: number;
}

export function contar(games: Games | undefined): Placar {
  const placar: Placar = { me: 0, opp: 0 };
  (games ?? []).forEach(g => {
    if (g === 'me') placar.me += 1;
    if (g === 'opp') placar.opp += 1;
  });
  return placar;
}

export interface Resultado {
  won: boolean;
  drew: boolean;
}

/**
 * O resultado que sai do placar. `null` quando nenhum game foi marcado — aí
 * não há o que concluir, e a tela precisa saber disso para não gravar uma
 * derrota que ninguém disse que aconteceu.
 */
export function resultadoDosGames(games: Games | undefined): Resultado | null {
  const { me, opp } = contar(games);
  if (me + opp === 0) return null;
  if (me === opp) return { won: false, drew: true };
  return { won: me > opp, drew: false };
}

/**
 * O caminho inverso, para o histórico que já existe.
 *
 * Vitória vira 2x1 e empate vira 1x1, como o Lucas pediu; derrota vira o 2x1
 * do outro lado, que é a mesma suposição vista do outro ângulo. É palpite
 * declarado, não medição: serve para a base inteira passar a ter placar sem
 * perder nada do que já estava lá.
 */
export function gamesSupostos(won: boolean, drew?: boolean): Games {
  if (drew) return ['me', 'opp', null];
  return won ? ['me', 'me', 'opp'] : ['opp', 'opp', 'me'];
}

/** "2×1", para a linha do histórico. Vazio quando não há games marcados. */
export function placarTexto(games: Games | undefined): string {
  const { me, opp } = contar(games);
  if (me + opp === 0) return '';
  return `${me}×${opp}`;
}

/**
 * O placar como o servidor guarda: um booleano por game, do ponto de vista do
 * dono da linha — true = o dono levou aquele game, null = não jogado.
 *
 * A tradução existe porque "eu" e "ele" não são absolutos: as duas linhas da
 * mesma partida são espelhos, e guardar por perspectiva permite ao servidor
 * inverter o placar do oponente com uma negação, em vez de reescrever rótulos.
 */
export function gamesParaServidor(games: Games | undefined): (boolean | null)[] | null {
  if (!games || games.every(g => !g)) return null;
  return games.map(g => (g === null ? null : g === 'me'));
}

export function gamesDoServidor(valor: unknown): Games | undefined {
  if (!Array.isArray(valor)) return undefined;
  const lado = (v: unknown): GameWinner =>
    v === true ? 'me' : v === false ? 'opp' : null;
  const games: Games = [lado(valor[0]), lado(valor[1]), lado(valor[2])];
  return games.some(Boolean) ? games : undefined;
}
