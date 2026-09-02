import { toCSV, parseCSV, CSV_HEADERS } from '../csv';
import { Match } from '../../types';

const base: Match = {
  id: 'm1',
  date: '2026-08-10T14:30:00.000Z',
  format: 'Commander',
  myDeck: 'Atraxa',
  oppDeck: 'Edgar Markov',
  archetype: 'Midrange',
  onPlay: true,
  won: true,
  drew: false,
  notes: '',
};

describe('toCSV', () => {
  it('escreve o cabeçalho completo', () => {
    expect(toCSV([]).split('\n')[0]).toBe(CSV_HEADERS.join(','));
  });

  it('escapa vírgula, aspas e quebra de linha nas notas', () => {
    const csv = toCSV([{ ...base, notes: 'Mulligan, "quase" ganhei\nno topdeck' }]);
    expect(csv).toContain('"Mulligan, ""quase"" ganhei\nno topdeck"');
  });
});

describe('parseCSV', () => {
  it('devolve vazio para arquivo sem linhas de dado', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV(CSV_HEADERS.join(','))).toEqual([]);
  });

  it('preserva o empate — a regressão que fazia todo empate voltar como derrota', () => {
    const draw: Match = { ...base, id: 'm2', won: false, drew: true };
    const [parsed] = parseCSV(toCSV([draw]));
    expect(parsed.drew).toBe(true);
    expect(parsed.won).toBe(false);
  });

  it('faz roundtrip sem perder campo nem trocar o id', () => {
    const matches: Match[] = [
      base,
      { ...base, id: 'm2', won: false, drew: false, onPlay: false, notes: 'com, vírgula' },
      { ...base, id: 'm3', won: false, drew: true, format: 'Modern' },
    ];
    expect(parseCSV(toCSV(matches))).toEqual(matches);
  });

  it('preserva a versão do deck, e ausência de versão continua ausente', () => {
    const [comVersao, semVersao] = parseCSV(toCSV([
      { ...base, deckVersion: 'v3 pós-ban' },
      { ...base, id: 'm2' },
    ]));
    expect(comVersao.deckVersion).toBe('v3 pós-ban');
    expect(semVersao).not.toHaveProperty('deckVersion');
  });

  it('sobrevive a nota com quebra de linha no meio', () => {
    const matches: Match[] = [
      { ...base, notes: 'primeira linha\nsegunda, com vírgula\n"terceira"' },
      { ...base, id: 'm2', notes: 'nota simples' },
    ];
    expect(parseCSV(toCSV(matches))).toEqual(matches);
  });

  it('aceita CRLF e ignora linhas em branco', () => {
    const csv = toCSV([base]).replace(/\n/g, '\r\n') + '\r\n\r\n';
    expect(parseCSV(csv)).toHaveLength(1);
  });

  it('gera id determinístico quando a coluna id não existe', () => {
    const csv = 'date,format,myDeck,oppDeck,archetype,onPlay,won,notes\n'
      + '2026-08-10T14:30:00.000Z,Commander,Atraxa,Urza,Combo,TRUE,FALSE,';
    const [parsed] = parseCSV(csv, 1_000);
    expect(parsed.id).toBe('imp_1000_0');
    expect(parsed.drew).toBe(false);
    expect(parsed.won).toBe(false);
    expect(parsed.onPlay).toBe(true);
  });
});

/**
 * O placar é a informação nova do histórico. Se ele não sobrevive a exportar
 * e reimportar, o primeiro backup apaga o que a mudança inteira serviu para
 * guardar.
 */
describe('placar no CSV', () => {
  const comPlacar: Match = {
    ...base,
    id: 'g1',
    games: ['me', 'opp', 'me'],
    won: true,
    drew: false,
  };

  it('ida e volta preserva o placar', () => {
    const [lido] = parseCSV(toCSV([comPlacar]));
    expect(lido.games).toEqual(['me', 'opp', 'me']);
  });

  it('partida sem placar volta sem a chave, e não com placar vazio', () => {
    const [lido] = parseCSV(toCSV([{ ...base, id: 'g2' }]));
    expect(lido).not.toHaveProperty('games');
  });

  it('placar parcial preserva os buracos', () => {
    const [lido] = parseCSV(toCSV([{ ...comPlacar, games: ['opp', null, null] }]));
    expect(lido.games).toEqual(['opp', null, null]);
  });

  it('CSV antigo, sem a coluna, continua importando', () => {
    const antigo = 'id,date,format,myDeck,oppDeck,won,drew\n'
      + 'x1,2026-01-01T00:00:00.000Z,Modern,Burn,Tron,TRUE,FALSE';
    const [lido] = parseCSV(antigo);
    expect(lido.id).toBe('x1');
    expect(lido).not.toHaveProperty('games');
  });
});
