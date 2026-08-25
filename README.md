# Bomberman DSU

POC de um Bomberman em **Phaser 3 + Vite**, feito para treinar **Disjoint Set Union (Union-Find)**.

A regra de arquitetura do projeto: tudo em `src/core/` é JavaScript puro, sem
nenhum import do Phaser. É lá que mora o algoritmo, e é lá que os testes batem.
O Phaser cuida só de render, input e game loop.

## Rodando

```bash
npm install
npm run dev
```

```bash
npm test
```

## Controles

| Tecla | Ação |
|---|---|
| Setas | mover (passo a passo, grid) |
| Espaço | soltar bomba (máx. 3) |
| `C` | overlay das componentes conexas |
| `R` | gerar um novo mapa |
| `M` | mudo (ou o botão 🔊 ao lado do tabuleiro) |

Objetivo: a saída está escondida sob um tijolo aleatório. Exploda tijolos até
achá-la e pise nela — sem se pegar na própria explosão.

## O painel de visualização

Ao lado do tabuleiro há um painel com três abas, uma por uso da DSU no jogo.
Todas mostram a mesma coisa por ângulos diferentes: os contadores da estrutura
(`find`, `union`, uniões efetivas, saltos percorridos, compressões,
profundidade máxima), a lista `parent[]` com as raízes destacadas, e os
conjuntos com o tamanho de cada um. A cor de um elemento vem da sua raiz, então
elementos do mesmo conjunto compartilham a cor — a mesma paleta do overlay `C`.

**Regiões** — as componentes conexas do chão, ao vivo. O mapa aparece em
miniatura pintado por componente, com a opacidade indicando a profundidade real
do elemento na árvore. **As bombas contam como obstáculo aqui**: plantar uma
num corredor estreito parte o mapa em duas regiões na hora, e é justamente esse
*split* que a DSU não sabe desfazer — daí a reconstrução do zero.

**Cadeia** — quais bombas vivas detonariam juntas se uma acendesse agora.
Plante duas dentro do alcance uma da outra e veja o `union` acontecer, com o
log mostrando a segunda chamada devolvendo "já conectados". Como as bombas
deixam de existir ao explodir, cada detonação é **arquivada**: o painel guarda
as últimas 12, com o `parent[]` e o log congelados no instante da explosão,
além de quantas bombas foram puxadas em cadeia, quantas células a cruz atingiu
e quantos tijolos caíram. Clique numa linha do histórico para abri-la.

**Kruskal** — replay passo a passo da geração do labirinto, com slider e
play/pause, além de um texto explicando o algoritmo. Começa com 42 salas
isoladas e termina com uma raiz só; a fila de arestas mostra a decisão de cada
uma (corredor, tijolo ou atalho). É a forma mais direta de ver por que o número
de arestas aceitas é sempre exatamente `n - 1`.

O painel roda a 8 quadros por segundo e custa cerca de 1 ms por atualização,
então não disputa orçamento com o game loop.

**O painel não pode contaminar o que mede.** Ele lê a estrutura com
`dsu.root()`, que sobe até a raiz sem comprimir o caminho e sem tocar nos
contadores. Usar `find()` para desenhar somaria centenas de chamadas por quadro
às estatísticas — o mostrador mediria a si mesmo — e ainda achataria as árvores,
apagando justamente a forma que o painel existe para mostrar. Pelo mesmo
motivo, as DSUs de regiões e de cadeia ficam em cache e só são refeitas quando
o mapa ou o conjunto de bombas muda.

## Os três usos da DSU

### 1. Geração do mapa — Kruskal aleatorizado (`core/mapgen.js`)

Células em coordenadas ímpares são "salas"; as células pares entre duas salas
são as paredes candidatas, ou seja, as **arestas** do grafo. Embaralhamos as
arestas e percorremos:

- `union(a, b)` retorna `true` → as salas estavam separadas, a parede vira
  **chão**. É uma aresta da árvore geradora.
- `union(a, b)` retorna `false` → já estavam conectadas, a parede vira
  **tijolo destrutível** (ou chão, com probabilidade `braid`, para criar ciclos
  e evitar um mapa puramente de corredores).

Consequência: o mapa é **100% conexo sem precisar explodir nada** — a árvore
geradora é sempre chão livre. Os tijolos são atalhos opcionais. Isso está
verificado em teste sobre 60 seeds.

### 2. Explosão em cadeia (`core/blast.js`)

Duas bombas entram no mesmo conjunto quando o raio de uma alcança a posição da
outra. A **transitividade sai de graça**: se A alcança B e B alcança C, as três
detonam juntas mesmo que A nunca chegue perto de C. Sem DSU isso viraria uma
BFS sobre grafo de bombas; com DSU é um `union` por par alcançado.

### 3. Componentes conexas do chão (`core/regions.js`)

Tecla `C` colore cada componente conexa de chão livre com uma cor diferente.
Serve para *ver* o que a DSU está computando.

**Limitação importante da DSU, explícita aqui:** a estrutura só sabe *unir*.
Destruir um tijolo é `union` (barato, incremental), mas colocar uma bomba ou
parede seria um *split* — impossível numa DSU clássica. Por isso o overlay é
reconstruído do zero a cada mudança do mapa. Num grid 15×13 são ~200 `union`s,
custo irrelevante. Em grid grande, seria o caso de usar DSU com rollback ou
partir para outra estrutura.

## Assets

Sprites e trilha ficam em `src/images/` e `src/audio/`, importados via Vite
(`src/assets.js`) para ganharem hash no build.

| Arquivo | Grade | Observação |
|---|---|---|
| `bomberman-sprite.png` | 32×32, `margin: 1` — 10×8 = 80 frames | alpha real, carrega direto |
| `bomb-sprite.png` | 16×16, `spacing: 1` | fundo **opaco**, precisa de tratamento |
| `bomberman5_ost.mp3` | — | ~3.5 MB, daí a barra de progresso na `BootScene` |

Duas armadilhas do sheet da bomba, resolvidas na `BootScene`:

1. **Fundo opaco.** O sheet não tem transparência — o fundo é o azul sólido
   `rgb(112,146,190)`. A `BootScene` copia a imagem para uma `CanvasTexture` e
   zera o alpha **apenas** nos pixels exatamente iguais a essa cor. A imagem
   tem só 48 cores distintas (sem artefato de compressão), então a comparação
   exata é segura. Importante não tocar no branco: ele é 35% da imagem e forma
   o núcleo das explosões.

2. **Logo embutido.** A metade direita do sheet tem o logo do jogo, e o Phaser
   calcularia 15 colunas. Refatiamos manualmente em **8 colunas**, então o
   índice do frame é `linha * 8 + coluna` e não sobra lixo.

Layout aproveitado do sheet da bomba: linha 0, colunas 0–3 é a bomba pulsando;
as linhas 1–5 são os 5 quadros da explosão, e as **colunas são as peças da
cruz** — 0 ponta vertical, 1 centro, 2 ponta horizontal, 3 haste vertical,
4 haste horizontal. As pontas do sheet apontam para cima e para a direita; as
outras duas direções saem de `setFlipY`/`setFlipX`.

O jogador usa 3 frames por direção (linha 0 frente, 2 costas, 3 perfil) e a
linha 4 para a animação de morte. Só existe o perfil esquerdo — o direito é
`setFlipX(true)`.

### Licença

O **código** está sob [licença MIT](LICENSE).

Os **assets** não. Sprites e áudio são material de *Super Bomberman*
(Hudson Soft / Konami), usados aqui só para estudo — a MIT não pode licenciar
o que não é meu. Para tornar o repositório público ou usá-lo comercialmente,
troque `src/images/` e `src/audio/` por assets próprios ou licenciados.

## Estrutura

```
src/
├─ core/            # JS puro, sem Phaser — o alvo dos testes
│  ├─ dsu.js        # DSU com path compression + union by rank
│  ├─ rng.js        # PRNG determinístico (mulberry32) + shuffle
│  ├─ tiles.js      # constantes de célula
│  ├─ mapgen.js     # Kruskal aleatorizado  → uso #1
│  ├─ blast.js      # raio da explosão + cadeia → uso #2
│  └─ regions.js    # componentes conexas → uso #3
├─ scenes/
│  ├─ BootScene.js  # load, chroma key do sheet da bomba, animações
│  └─ GameScene.js  # render, input, game loop
├─ viz/
│  └─ panel.js      # painel lateral: as três DSUs em tempo real
├─ images/          # spritesheets
├─ audio/           # trilha da fase
├─ assets.js        # URLs + descrição das grades
├─ config.js
└─ main.js
```

## Detalhes de implementação que valem a leitura

- **`find` é iterativo**, com duas passadas (acha a raiz, depois comprime o
  caminho). Recursão estouraria a pilha em corrente longa — há teste com
  200 mil elementos.
- **Índice linear**: célula `(x, y)` vira `y * COLS + x`. A DSU opera direto
  sobre inteiros, sem mapa auxiliar.
- **Mapa determinístico por seed** — o HUD mostra a seed, então dá para
  reproduzir qualquer mapa e depurar a geração.
- **Explosão calcula todas as chamas antes de aplicar o dano**, senão um tijolo
  destruído no meio do cálculo deixaria a chama passar mais longe do que deveria.
- **`blastCells` devolve a peça da cruz junto com a célula** (`axis` e `tip`).
  É geometria pura, não render — por isso mora no `core/` e tem teste. Quando
  duas explosões se cruzam na mesma célula, a peça é promovida a centro.
- **A música só começa depois de um gesto do usuário**, exigência do navegador.
  A cena checa `sound.locked` e, se preciso, espera o evento `UNLOCKED`. Ela
  também pausa quando a aba vai para segundo plano (Page Visibility API) — sem
  isso, uma aba esquecida fica tocando a trilha indefinidamente.
- **A cena é a dona do estado de mudo**, e não o `sound.mute` do Phaser. No
  WebAudio esse getter lê o ganho de um nó de áudio, que só reflete a mudança
  no bloco de processamento seguinte; ler logo após escrever devolve o valor
  antigo e deixaria o botão um clique atrasado. A preferência fica em
  `localStorage`.
- **`sound.add({ volume })` não chega ao nó de ganho** nesta versão do Phaser:
  o valor fica registrado em `bgm.config` enquanto o gain segue em 1, e a
  trilha toca no volume cheio. É preciso chamar `setVolume()` explicitamente.
- **A instrumentação da DSU é opt-in.** Contadores são sempre baratos, mas o
  log de operações só existe com `{ trace: true }`. O `core/` continua sem
  qualquer referência a DOM ou a Phaser.

## Próximos passos possíveis

- Power-ups (mais alcance, mais bombas) sob os tijolos
- Inimigos com IA usando as componentes conexas para decidir fuga
- DSU com rollback, para suportar o *split* ao colocar bomba
- Kruskal com pesos, para enviesar a topologia do labirinto
