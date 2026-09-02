import { Language } from '../types';

/**
 * Os idiomas que o app fala, na ordem em que aparecem.
 *
 * Fica aqui, e não dentro de uma tela, porque duas telas escolhem idioma: o
 * onboarding, logo na primeira abertura, e Configurações. Uma lista em cada
 * lugar sairia de sincronia no dia em que entrasse um idioma novo.
 *
 * Os rótulos não são traduzidos de propósito: quem procura o próprio idioma
 * procura por como ele se escreve nele mesmo, não por como o app o chama no
 * idioma que a pessoa não entende.
 */
export const LANGUAGES: { code: Language; label: string; sub: string }[] = [
  { code: 'en-US', label: 'English', sub: 'English (US)' },
  { code: 'pt-BR', label: 'Português', sub: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語', sub: 'Japanese' },
];
