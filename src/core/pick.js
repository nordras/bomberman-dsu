/**
 * Sorteia um indice em [0, n) evitando repetir `last`.
 *
 * Aleatorio puro repete demais para o ouvido: com 3 variacoes, a mesma amostra
 * sai duas vezes seguidas em 1 de cada 3 usos, e a repeticao e percebida como
 * falha ("travou o som"). Sorteando entre as outras `n - 1` o resultado soa
 * mais aleatorio do que o aleatorio de verdade.
 *
 * @param {number} n quantidade de opcoes
 * @param {number} last indice usado por ultimo (-1 quando ainda nao houve)
 * @param {() => number} [rand] fonte de aleatoriedade, para poder testar
 * @returns {number} indice sorteado
 */
export function pickAvoidingRepeat(n, last, rand = Math.random) {
  if (n <= 1) return 0;
  if (last < 0 || last >= n) return Math.floor(rand() * n);

  // sorteia entre n-1 posicoes e "pula" a ocupada pela ultima amostra
  let i = Math.floor(rand() * (n - 1));
  if (i >= last) i += 1;
  return i;
}
