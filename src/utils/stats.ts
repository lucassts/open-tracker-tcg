import { Match, Filters, ComputedStats, RecordRow } from '../types';

export function applyFilters(matches: Match[], filters: Filters): Match[] {
  return matches.filter(m => {
    if (filters.format && filters.format !== 'All' && m.format !== filters.format) return false;
    if (filters.deck.length > 0 && !filters.deck.includes(m.myDeck)) return false;
    if (filters.oppDeck.length > 0 && !filters.oppDeck.includes(m.oppDeck)) return false;
    // String vazia representa "sem versão" — partida salva antes de o deck
    // passar a ser versionado. Sem esse caso o filtro esconderia histórico.
    if (filters.version?.length > 0 && !filters.version.includes(m.deckVersion || '')) return false;
    // Mesmo raciocínio da versão: a string vazia é a opção "sem local".
    if (filters.venue?.length > 0 && !filters.venue.includes(m.venueName || '')) return false;
    if (filters.period && filters.period !== 'All') {
      if (filters.period === '1d') {
        // "Hoje" = a partir da meia-noite do dia atual (horário local)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(m.date).getTime() < today.getTime()) return false;
      } else {
        const days = ({ '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[filters.period];
        if (days) {
          const cutoff = Date.now() - days * 86400000;
          if (new Date(m.date).getTime() < cutoff) return false;
        }
      }
    }
    if (filters.result && filters.result !== 'All') {
      if (filters.result === 'Wins' && !(m.won && !m.drew)) return false;
      if (filters.result === 'Losses' && !(!m.won && !m.drew)) return false;
      if (filters.result === 'Draws' && !m.drew) return false;
    }
    return true;
  });
}

/**
 * Agrupa por um rótulo tirado da partida e devolve vitórias, derrotas e
 * aproveitamento. Empate conta na lista mas fica fora do percentual — é o
 * mesmo critério do resto do app.
 *
 * Partida sem o rótulo simplesmente não entra: "sem oponente registrado" não
 * é um oponente, e viraria uma linha que ninguém sabe ler.
 */
function recordBy(matches: Match[], key: (m: Match) => string | undefined): RecordRow[] {
  const map: Record<string, { wins: number; losses: number }> = {};
  matches.forEach(m => {
    const label = key(m)?.trim();
    if (!label) return;
    if (!map[label]) map[label] = { wins: 0, losses: 0 };
    if (m.drew) return;
    if (m.won) map[label].wins++; else map[label].losses++;
  });
  return Object.entries(map)
    .map(([l, v]) => ({
      l, wins: v.wins, losses: v.losses,
      wr: (v.wins + v.losses) ? Math.round(v.wins / (v.wins + v.losses) * 100) : 0,
    }))
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses) || a.l.localeCompare(b.l));
}

export function computeStats(matches: Match[]): ComputedStats {
  const total = matches.length;
  const wins = matches.filter(m => m.won && !m.drew).length;
  const draws = matches.filter(m => m.drew === true).length;
  const losses = total - wins - draws;
  const wr = total ? Math.round((wins / total) * 100) : 0;

  // Streak (from newest) — draws break the streak
  let streak = 0;
  let streakType: boolean | null = null;
  for (const m of matches) {
    if (m.drew) break; // draw resets streak
    if (streakType === null) { streakType = m.won; streak = 1; continue; }
    if (m.won === streakType) streak++; else break;
  }

  // On play / on draw (draws excluded from both numerator and denominator)
  const onPlayMatches = matches.filter(m => m.onPlay);
  const onDrawMatches = matches.filter(m => !m.onPlay);
  const onPlayWR = onPlayMatches.length
    ? Math.round(onPlayMatches.filter(m => m.won && !m.drew).length / onPlayMatches.length * 100) : 0;
  const onDrawWR = onDrawMatches.length
    ? Math.round(onDrawMatches.filter(m => m.won && !m.drew).length / onDrawMatches.length * 100) : 0;

  // Evolution — sessions of 5
  const evolution: number[] = [];
  const chunk = 5;
  for (let i = matches.length; i > 0; i -= chunk) {
    const slice = matches.slice(Math.max(0, i - chunk), i);
    const sliceWr = Math.round(slice.filter(m => m.won && !m.drew).length / slice.length * 100);
    evolution.unshift(sliceWr);
  }

  // Decks
  const deckMap: Record<string, { wins: number; losses: number }> = {};
  matches.forEach(m => {
    if (!deckMap[m.myDeck]) deckMap[m.myDeck] = { wins: 0, losses: 0 };
    if (m.won && !m.drew) deckMap[m.myDeck].wins++; else if (!m.drew) deckMap[m.myDeck].losses++;
  });
  const decks = Object.entries(deckMap).map(([l, v]) => ({
    l, wins: v.wins, losses: v.losses,
    wr: (v.wins + v.losses) ? Math.round(v.wins / (v.wins + v.losses) * 100) : 0,
  })).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

  // Opponents
  const oppMap: Record<string, number> = {};
  matches.forEach(m => { oppMap[m.oppDeck] = (oppMap[m.oppDeck] || 0) + 1; });
  const opponents = Object.entries(oppMap)
    .map(([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  // Contra quem, e onde
  const oppPlayers = recordBy(matches, m => m.opponentName);
  const venues = recordBy(matches, m => m.venueName);

  // Archetypes
  const archMap: Record<string, { wins: number; total: number }> = {};
  matches.forEach(m => {
    if (!archMap[m.archetype]) archMap[m.archetype] = { wins: 0, total: 0 };
    archMap[m.archetype].total++;
    if (m.won && !m.drew) archMap[m.archetype].wins++;
  });
  const archetypes = Object.entries(archMap)
    .map(([l, v]) => ({ l, v: Math.round(v.wins / v.total * 100), n: v.total }))
    .sort((a, b) => b.v - a.v);

  return {
    total, wins, losses, draws, wr,
    streak, streakType,
    onPlayWR, onDrawWR,
    evolution,
    decks, opponents, oppPlayers, venues, archetypes,
  };
}
