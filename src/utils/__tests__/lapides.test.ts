import { adicionarLapide, adicionarLapides, semApagadas } from '../lapides';

describe('adicionarLapide', () => {
  it('anota o id', () => {
    expect(adicionarLapide([], 'a')).toEqual(['a']);
  });

  it('não repete', () => {
    expect(adicionarLapide(['a'], 'a')).toEqual(['a']);
  });

  it('partida que nunca subiu não deixa lápide', () => {
    expect(adicionarLapide(['a'], undefined)).toEqual(['a']);
  });

  it('anota várias, ignorando as que não subiram', () => {
    expect(adicionarLapides([], ['a', undefined, 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('semApagadas', () => {
  const vindas = [{ syncId: 'a' }, { syncId: 'b' }, { syncId: 'c' }];

  it('sem lápide, nada é filtrado', () => {
    expect(semApagadas(vindas, [])).toHaveLength(3);
  });

  /**
   * O caso real: a partida foi apagada aqui, a exclusão ainda não saiu, e a
   * leitura traz a linha que continua no servidor. Sem o filtro ela renasce.
   */
  it('a partida apagada não volta na leitura', () => {
    expect(semApagadas(vindas, ['b']).map(v => v.syncId)).toEqual(['a', 'c']);
  });

  it('linha sem syncId passa', () => {
    expect(semApagadas([{ syncId: undefined }], ['b'])).toHaveLength(1);
  });
});
