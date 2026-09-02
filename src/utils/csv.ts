import { Match } from '../types';

/**
 * Colunas exportadas. `id` entra para que reimportar o próprio export não
 * duplique partidas, e `drew` entra porque sem ela todo empate volta como derrota.
 */
export const CSV_HEADERS = [
  'id', 'date', 'format', 'myDeck', 'deckVersion', 'oppDeck',
  'archetype', 'onPlay', 'won', 'drew', 'games', 'notes',
] as const;

/**
 * O placar cabe numa célula como "me|opp|me" — três posições separadas por
 * barra, vazio onde o game não foi jogado. Sem isso, exportar e reimportar
 * devolveria a partida sem placar, e a informação mais fina do histórico
 * morreria no primeiro backup.
 */
export function gamesParaCelula(games: Match['games']): string {
  if (!games || games.every(g => !g)) return '';
  return games.map(g => g ?? '').join('|');
}

export function celulaParaGames(cell: string): Match['games'] | undefined {
  const partes = cell.split('|').map(p => p.trim());
  const valor = (v: string) => (v === 'me' || v === 'opp' ? v : null);
  const games = [valor(partes[0] ?? ''), valor(partes[1] ?? ''), valor(partes[2] ?? '')] as
    NonNullable<Match['games']>;
  return games.some(Boolean) ? games : undefined;
}

function escapeCell(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value == null) return '';
  const s = String(value);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function toCSV(matches: Match[]): string {
  const rows = matches.map(m =>
    CSV_HEADERS.map(h => escapeCell(
      h === 'games'
        ? gamesParaCelula(m.games)
        : (m as unknown as Record<string, unknown>)[h]
    )).join(',')
  );
  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

const BOOL_COLUMNS = new Set(['onPlay', 'won', 'drew']);

/**
 * Tokeniza o arquivo inteiro de uma vez, em vez de quebrar por linha antes.
 *
 * Quebrar por `\n` primeiro parece funcionar até alguém escrever uma nota com
 * mais de uma linha: dentro de aspas, a quebra faz parte do campo e não separa
 * registros. Este laço só encerra a linha quando está fora de aspas.
 */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellWasQuoted = false;

  const endCell = () => {
    // Campo sem aspas ganha trim; entre aspas, o espaço é do usuário.
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = '';
    cellWasQuoted = false;
  };
  const endRow = () => {
    endCell();
    // Ignora a linha em branco que sobra no fim do arquivo.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }  // "" = aspa literal
        else inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; cellWasQuoted = true; }
    else if (ch === ',') endCell();
    else if (ch === '\r') { /* consumido junto com o \n seguinte */ }
    else if (ch === '\n') endRow();
    else cell += ch;
  }

  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Lê um CSV exportado pelo app (ou compatível) e devolve partidas.
 * Linhas sem id ganham um id derivado do índice — a deduplicação acontece na store.
 */
export function parseCSV(text: string, now: number = Date.now()): Match[] {
  const rows = parseRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  return rows.slice(1).map((cols, idx) => {
    const obj: Record<string, unknown> = {};

    headers.forEach((h, i) => {
      if (!h) return;
      const raw = cols[i] ?? '';
      obj[h] = BOOL_COLUMNS.has(h) ? raw.trim().toUpperCase() === 'TRUE' : raw;
    });

    if (!obj.id) obj.id = `imp_${now}_${idx}`;
    if (!obj.date) obj.date = new Date(now).toISOString();
    if (obj.drew == null) obj.drew = false;
    // Coluna vazia significa "sem versão", não uma versão chamada "".
    if (!obj.deckVersion) delete obj.deckVersion;

    const games = celulaParaGames(String(obj.games ?? ''));
    if (games) obj.games = games;
    else delete obj.games;

    return obj as unknown as Match;
  });
}

/** Nome do arquivo gerado na exportação. */
export const CSV_FILENAME = 'mtg-matches.csv';
