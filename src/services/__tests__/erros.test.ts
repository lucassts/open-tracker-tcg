import { mensagemDeErro, ehSessaoVencida, codigoDoErro, Frases } from '../erros';

const FRASES: Frases = {
  sessaoVencida: 'sua sessão expirou',
  naoAchei: 'não achei ninguém com esse apelido ou e-mail',
  voceMesmo: 'esse apelido é o seu',
  semRede: 'sem conexão com o servidor',
  generico: 'não deu certo',
};

describe('ehSessaoVencida', () => {
  it('reconhece o permission denied do Postgres', () => {
    expect(ehSessaoVencida({ code: '42501', message: 'permission denied for function x' })).toBe(true);
  });

  it('reconhece JWT ausente ou vencido', () => {
    expect(ehSessaoVencida({ code: 'PGRST301' })).toBe(true);
    expect(ehSessaoVencida({ message: 'JWT expired' })).toBe(true);
  });

  it('não confunde com erro comum', () => {
    expect(ehSessaoVencida(new Error('qualquer coisa'))).toBe(false);
    expect(ehSessaoVencida({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
});

describe('mensagemDeErro', () => {
  it('o objeto do PostgREST não vira mais [object Object]', () => {
    const erro = { code: '23505', message: 'duplicate key value' };
    expect(mensagemDeErro(erro, FRASES)).toBe('duplicate key value');
    expect(mensagemDeErro(erro, FRASES)).not.toContain('[object');
  });

  it('sessão vencida ganha a frase própria, e não o texto do banco', () => {
    const erro = { code: '42501', message: 'permission denied for function send_friend_request' };
    expect(mensagemDeErro(erro, FRASES)).toBe(FRASES.sessaoVencida);
  });

  /**
   * O texto das exceções foi gravado no banco com o acento corrompido, e a
   * tela mostrava "nÃ£o achei ninguÃ©m". Traduzir pelo código no app resolve
   * isso e o idioma de uma vez.
   */
  it('código conhecido usa a frase do app, ignorando o texto do banco', () => {
    const erro = { code: 'P0002', message: 'nÃ£o achei ninguÃ©m com esse apelido' };
    expect(mensagemDeErro(erro, FRASES)).toBe(FRASES.naoAchei);
    expect(mensagemDeErro({ code: '22023', message: 'esse Ã© vocÃª' }, FRASES)).toBe(FRASES.voceMesmo);
  });

  it('falha de rede do fetch vira frase de rede', () => {
    expect(mensagemDeErro(new TypeError('Network request failed'), FRASES)).toBe(FRASES.semRede);
  });

  it('Error comum mantém a própria mensagem', () => {
    expect(mensagemDeErro(new Error('apelido inválido'), FRASES)).toBe('apelido inválido');
  });

  /**
   * Um código que o app ainda não conhece cairia no texto do banco, que está
   * gravado com o acento corrompido. Mostrar isso é pior do que não mostrar.
   */
  it('texto ilegível do servidor vira a frase genérica', () => {
    const quebrado = String.fromCharCode(0x6e, 0xc3, 0xa3, 0x6f) + ' achei';
    expect(mensagemDeErro({ code: 'P9999', message: quebrado }, FRASES)).toBe(FRASES.generico);
  });

  it('texto legível do servidor continua passando', () => {
    expect(mensagemDeErro({ code: 'P9999', message: 'deck already exists' }, FRASES))
      .toBe('deck already exists');
  });

  it('não quebra com nulo nem com string', () => {
    expect(mensagemDeErro('deu ruim', FRASES)).toBe('deu ruim');
    expect(mensagemDeErro(null, FRASES)).toBe(FRASES.generico);
  });
});

describe('codigoDoErro', () => {
  it('devolve o código quando existe', () => {
    expect(codigoDoErro({ code: '42501' })).toBe('42501');
  });
  it('devolve nulo quando não existe', () => {
    expect(codigoDoErro(new Error('x'))).toBeNull();
    expect(codigoDoErro(undefined)).toBeNull();
  });
});
