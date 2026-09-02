import { Match } from '../types';
import { Games } from '../utils/games';

const DECKS_MINE = ['Atraxa', 'Kinnan', 'Burn', 'Yuriko'];
const DECKS_OPP = [
  'Edgar Markov', 'Urza', 'Atraxa', 'Krenko', 'Yuriko',
  'Winota', 'Narset', 'Kaalia', 'Tymna/Thrasios',
];
// Nome de pessoa e de local entram no exemplo porque sem eles as duas listas
// de aproveitamento — por oponente e por local — nascem vazias, e quem carrega
// os dados de exemplo nunca descobre que elas existem.
const OPPONENTS = ['Bruno', 'Marina', 'Téo', 'Rafa'];
const VENUES = ['Liga Mágica', 'Cardhouse', 'Casa do Bruno'];
const FORMATS = ['Commander', 'Modern', 'Standard', 'Pioneer'] as const;
const ARCHETYPES = ['Aggro', 'Midrange', 'Control', 'Combo', 'Stax'] as const;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedMatches(): Match[] {
  const rng = mulberry32(42);
  const now = Date.now();
  const out: Match[] = [];

  for (let i = 0; i < 48; i++) {
    const daysAgo = Math.floor(rng() * 28);
    const date = new Date(now - daysAgo * 86400000 - Math.floor(rng() * 50000000));
    const format = i < 36 ? 'Commander' : FORMATS[1 + Math.floor(rng() * 3)];
    const myDeck = DECKS_MINE[Math.floor(rng() * DECKS_MINE.length)];
    const oppDeck = DECKS_OPP[Math.floor(rng() * DECKS_OPP.length)];
    const archetype = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
    const onPlay = rng() > 0.5;

    let winProb = 0.5;
    if (onPlay) winProb += 0.08;
    if (myDeck === 'Atraxa') winProb += 0.1;
    if (myDeck === 'Burn') winProb -= 0.12;
    if (archetype === 'Aggro') winProb += 0.15;
    if (archetype === 'Control') winProb -= 0.1;
    const won = rng() < winProb;
    // Placar coerente com o resultado, com variedade: nem toda vitória é 2x1.
    // Sem isto o exemplo mostraria 48 partidas sem placar numa tela que agora
    // gira em torno dele.
    const varreu = rng() < 0.4;
    const games: Games = won
      ? (varreu ? ['me', 'me', null] : ['me', 'opp', 'me'])
      : (varreu ? ['opp', 'opp', null] : ['opp', 'me', 'opp']);

    out.push({
      id: 'm' + i,
      date: date.toISOString(),
      format,
      myDeck,
      oppDeck,
      archetype,
      onPlay,
      games,
      won,
      notes: i % 6 === 0 ? 'Mulligan to 6, topdecked perfectly.' : '',
      // Nem toda partida tem esses campos na vida real, e o exemplo reflete
      // isso: as listas precisam funcionar com histórico incompleto.
      opponentName: i % 3 === 0 ? undefined : OPPONENTS[Math.floor(rng() * OPPONENTS.length)],
      venueName: i % 4 === 0 ? undefined : VENUES[Math.floor(rng() * VENUES.length)],
      deckVersion: myDeck === 'Atraxa' ? (i % 2 === 0 ? 'v1' : 'v2 pós-ban') : undefined,
    });
  }

  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
