import {
  contar, resultadoDosGames, gamesSupostos, placarTexto, Games,
  gamesParaServidor, gamesDoServidor,
} from '../games';

const g = (...v: Array<'me' | 'opp' | null>): Games =>
  [v[0] ?? null, v[1] ?? null, v[2] ?? null];

describe('resultadoDosGames', () => {
  it('2x1 é vitória', () => {
    expect(resultadoDosGames(g('me', 'opp', 'me'))).toEqual({ won: true, drew: false });
  });

  it('2x0 é vitória', () => {
    expect(resultadoDosGames(g('me', 'me'))).toEqual({ won: true, drew: false });
  });

  it('1x0 é vitória de quem levou o game', () => {
    expect(resultadoDosGames(g('me'))).toEqual({ won: true, drew: false });
    expect(resultadoDosGames(g('opp'))).toEqual({ won: false, drew: false });
  });

  it('1x1 é empate', () => {
    expect(resultadoDosGames(g('me', 'opp'))).toEqual({ won: false, drew: true });
  });

  it('1x2 é derrota', () => {
    expect(resultadoDosGames(g('opp', 'me', 'opp'))).toEqual({ won: false, drew: false });
  });

  it('sem game marcado não há resultado', () => {
    expect(resultadoDosGames(g())).toBeNull();
    expect(resultadoDosGames(undefined)).toBeNull();
  });

  it('a ordem dos games não muda o resultado', () => {
    expect(resultadoDosGames(g('opp', 'me', 'me'))).toEqual({ won: true, drew: false });
    expect(resultadoDosGames(g('me', 'me', 'opp'))).toEqual({ won: true, drew: false });
  });
});

describe('contar', () => {
  it('conta cada lado e ignora os não jogados', () => {
    expect(contar(g('me', 'opp', null))).toEqual({ me: 1, opp: 1 });
    expect(contar(undefined)).toEqual({ me: 0, opp: 0 });
  });
});

/**
 * O histórico anterior não tem placar. A suposição precisa ser reversível:
 * o resultado que sai dos games supostos tem de ser o mesmo que estava salvo,
 * senão a migração reescreveria a estatística de quem já usava o app.
 */
describe('gamesSupostos', () => {
  it('vitória vira 2x1', () => {
    expect(contar(gamesSupostos(true))).toEqual({ me: 2, opp: 1 });
  });

  it('empate vira 1x1', () => {
    expect(contar(gamesSupostos(false, true))).toEqual({ me: 1, opp: 1 });
  });

  it('derrota vira 1x2', () => {
    expect(contar(gamesSupostos(false))).toEqual({ me: 1, opp: 2 });
  });

  it('o resultado suposto reproduz o resultado guardado', () => {
    const casos: Array<[boolean, boolean | undefined]> = [
      [true, false], [false, true], [false, false], [true, undefined], [false, undefined],
    ];
    casos.forEach(([won, drew]) => {
      expect(resultadoDosGames(gamesSupostos(won, drew)))
        .toEqual({ won: Boolean(won) && !drew, drew: Boolean(drew) });
    });
  });
});

describe('placarTexto', () => {
  it('mostra o placar quando existe', () => {
    expect(placarTexto(g('me', 'me', 'opp'))).toBe('2×1');
  });
  it('fica vazio sem games', () => {
    expect(placarTexto(g())).toBe('');
    expect(placarTexto(undefined)).toBe('');
  });
});

/**
 * O servidor guarda por perspectiva do dono da linha, para poder inverter o
 * placar do oponente com uma negação. A tradução tem de ser exata nos dois
 * sentidos, senão um 2x1 vira 1x2 na volta.
 */
describe('tradução para o servidor', () => {
  it('me vira true e opp vira false', () => {
    expect(gamesParaServidor(g('me', 'opp', 'me'))).toEqual([true, false, true]);
  });

  it('game não jogado vira null', () => {
    expect(gamesParaServidor(g('me', 'me'))).toEqual([true, true, null]);
  });

  it('placar vazio não vai para o servidor', () => {
    expect(gamesParaServidor(g())).toBeNull();
    expect(gamesParaServidor(undefined)).toBeNull();
  });

  it('ida e volta preserva o placar', () => {
    const original = g('opp', 'me', 'opp');
    expect(gamesDoServidor(gamesParaServidor(original))).toEqual(original);
  });

  it('resposta sem placar volta indefinida', () => {
    expect(gamesDoServidor(null)).toBeUndefined();
    expect(gamesDoServidor([null, null, null])).toBeUndefined();
    expect(gamesDoServidor('nada disso')).toBeUndefined();
  });

  it('a inversão do servidor equivale a trocar os lados', () => {
    const meu = gamesParaServidor(g('me', 'opp', 'me'))!;
    const dele = meu.map(v => (v === null ? null : !v));
    expect(gamesDoServidor(dele)).toEqual(g('opp', 'me', 'opp'));
  });
});
