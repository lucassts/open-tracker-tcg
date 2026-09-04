/**
 * As partidas apagadas que o servidor ainda não sabe que foram apagadas.
 *
 * Apagar é a única operação que não sobrevive sozinha à sincronização: enviar
 * de novo o que existe é fácil, mas "isto não existe mais" some junto com a
 * linha. Sem guardar o id em algum lugar, a leitura seguinte encontra a
 * partida ainda no servidor e a recria — que foi exatamente o que aconteceu.
 *
 * O nome é o de sempre para isso: uma lápide marca onde havia algo.
 */

/** Anota um id para apagar no servidor. Ignora repetido e vazio. */
export function adicionarLapide(atuais: string[], syncId?: string): string[] {
  if (!syncId) return atuais;
  return atuais.includes(syncId) ? atuais : [...atuais, syncId];
}

/** Anota vários de uma vez — o caso de "apagar todos os dados". */
export function adicionarLapides(atuais: string[], syncIds: (string | undefined)[]): string[] {
  return syncIds.reduce<string[]>((acc, id) => adicionarLapide(acc, id), atuais);
}

/**
 * Tira da leitura o que já foi apagado aqui.
 *
 * Rede de segurança para a corrida: se a exclusão ainda não saiu, ou saiu e
 * outro aparelho reenviou a mesma partida no meio do caminho, a linha voltaria
 * viva. Com a lápide na mão, ela não volta.
 */
export function semApagadas<T extends { syncId?: string }>(
  vindas: T[],
  lapides: readonly string[]
): T[] {
  if (lapides.length === 0) return vindas;
  const mortas = new Set(lapides);
  return vindas.filter(v => !v.syncId || !mortas.has(v.syncId));
}
