import { applyFilters, computeStats } from '../stats';
import { Filters, Match } from '../../types';

const m = (over: Partial<Match> & { id: string }): Match => ({
  date: '2026-08-10T12:00:00.000Z',
  format: 'Commander',
  myDeck: 'Atraxa',
  oppDeck: 'Urza',
  archetype: 'Midrange',
  onPlay: true,
  won: true,
  drew: false,
  notes: '',
  ...over,
});

const noFilters: Filters = {
  format: 'All', deck: [], oppDeck: [], period: 'All', result: 'All',
  version: [], venue: [],
};

describe('filtro de versão', () => {
  const rows = [
    m({ id: '1', deckVersion: 'v1', won: true }),
    m({ id: '2', deckVersion: 'v2', won: false }),
    m({ id: '3', won: true }), // salva antes de o deck ser versionado
  ];

  it('lista vazia significa todas as versões', () => {
    expect(applyFilters(rows, noFilters)).toHaveLength(3);
  });

  it('seleciona várias versões ao mesmo tempo', () => {
    const r = applyFilters(rows, { ...noFilters, version: ['v1', 'v2'] });
    expect(r.map(x => x.id)).toEqual(['1', '2']);
  });

  it('string vazia pega a partida sem versão', () => {
    const r = applyFilters(rows, { ...noFilters, version: [''] });
    expect(r.map(x => x.id)).toEqual(['3']);
  });
});

describe('aproveitamento por oponente e por local', () => {
  const rows = [
    m({ id: '1', opponentName: 'Bruno', venueName: 'Loja do Zé', won: true }),
    m({ id: '2', opponentName: 'Bruno', venueName: 'Loja do Zé', won: false }),
    m({ id: '3', opponentName: 'Bruno', venueName: 'Casa', won: true }),
    m({ id: '4', won: true }), // sem oponente nem local registrado
  ];

  it('agrupa por pessoa e calcula o win rate', () => {
    const s = computeStats(rows);
    expect(s.oppPlayers).toEqual([
      { l: 'Bruno', wins: 2, losses: 1, wr: 67 },
    ]);
  });

  it('agrupa por local, do mais jogado para o menos', () => {
    const s = computeStats(rows);
    expect(s.venues.map(v => v.l)).toEqual(['Loja do Zé', 'Casa']);
    expect(s.venues[0]).toMatchObject({ wins: 1, losses: 1, wr: 50 });
  });

  it('partida sem oponente ou local não vira uma linha em branco', () => {
    const s = computeStats([m({ id: '9', won: true })]);
    expect(s.oppPlayers).toEqual([]);
    expect(s.venues).toEqual([]);
  });

  it('empate entra na lista mas fica fora do percentual', () => {
    const s = computeStats([
      m({ id: '1', opponentName: 'Ana', won: true }),
      m({ id: '2', opponentName: 'Ana', won: false, drew: true }),
    ]);
    expect(s.oppPlayers).toEqual([{ l: 'Ana', wins: 1, losses: 0, wr: 100 }]);
  });
});

describe('computeStats', () => {
  it('conta empate como empate, não como derrota', () => {
    const s = computeStats([
      m({ id: '1', won: true }),
      m({ id: '2', won: false }),
      m({ id: '3', won: false, drew: true }),
    ]);
    expect(s).toMatchObject({ total: 3, wins: 1, losses: 1, draws: 1 });
  });

  it('trata lista vazia sem dividir por zero', () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ total: 0, wr: 0, streak: 0, streakType: null });
    expect(s.evolution).toEqual([]);
  });

  it('interrompe a sequência num empate', () => {
    const s = computeStats([
      m({ id: '1', won: true }),
      m({ id: '2', won: true }),
      m({ id: '3', won: false, drew: true }),
      m({ id: '4', won: true }),
    ]);
    expect(s.streak).toBe(2);
    expect(s.streakType).toBe(true);
  });
});

describe('applyFilters', () => {
  it('separa vitória, derrota e empate', () => {
    const all = [
      m({ id: '1', won: true }),
      m({ id: '2', won: false }),
      m({ id: '3', won: false, drew: true }),
    ];
    expect(applyFilters(all, { ...noFilters, result: 'Wins' }).map(x => x.id)).toEqual(['1']);
    expect(applyFilters(all, { ...noFilters, result: 'Losses' }).map(x => x.id)).toEqual(['2']);
    expect(applyFilters(all, { ...noFilters, result: 'Draws' }).map(x => x.id)).toEqual(['3']);
  });

  it('filtra por vários decks ao mesmo tempo', () => {
    const all = [
      m({ id: '1', myDeck: 'Atraxa' }),
      m({ id: '2', myDeck: 'Kinnan' }),
      m({ id: '3', myDeck: 'Burn' }),
    ];
    expect(
      applyFilters(all, { ...noFilters, deck: ['Atraxa', 'Burn'] }).map(x => x.id)
    ).toEqual(['1', '3']);
  });

  it('descarta partidas fora da janela de 7 dias', () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    const all = [m({ id: 'novo', date: recent }), m({ id: 'velho', date: old })];
    expect(applyFilters(all, { ...noFilters, period: '7d' }).map(x => x.id)).toEqual(['novo']);
  });
});

/**
 * O filtro de local vale para as estatísticas e, por tabela, para o card de
 * compartilhamento — que é onde o Lucas sentiu falta dele.
 */
describe('filtro de local', () => {
  const rows = [
    m({ id: '1', venueName: 'Liga Lendária', won: true }),
    m({ id: '2', venueName: 'Casa do Rafa', won: false }),
    m({ id: '3', won: true }),
  ];

  it('lista vazia não filtra nada', () => {
    expect(applyFilters(rows, noFilters)).toHaveLength(3);
  });

  it('filtra por um local', () => {
    const r = applyFilters(rows, { ...noFilters, venue: ['Liga Lendária'] });
    expect(r.map(x => x.id)).toEqual(['1']);
  });

  it('aceita vários locais', () => {
    const r = applyFilters(rows, { ...noFilters, venue: ['Liga Lendária', 'Casa do Rafa'] });
    expect(r.map(x => x.id)).toEqual(['1', '2']);
  });

  it('string vazia pega a partida sem local', () => {
    const r = applyFilters(rows, { ...noFilters, venue: [''] });
    expect(r.map(x => x.id)).toEqual(['3']);
  });
});
