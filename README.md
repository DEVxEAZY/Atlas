# Atlas Harness

Atlas é o harness desktop para organizar e operar fluxos de desenvolvimento em servidores Linux remotos sem depender, no primeiro momento, de uma API customizada de runtime.

O produto oferece uma interface local para Windows, conecta-se ao host por SSH e apresenta domínios, workspaces, repositórios, sessões Codex/Claude e terminais brutos sem criar uma árvore virtual diferente do filesystem remoto.

> **Estado:** arquitetura inicial. A continuidade da interface e do harness acontece neste repositório. A stack e o mecanismo de persistência dos processos ainda serão decididos antes do scaffold.

## Primeiro recorte

- aplicativo desktop Windows;
- credenciais e conexões SSH mantidas fora do renderer;
- domínios e workspaces baseados em diretórios Linux reais;
- Explorer do Domínio projetando a árvore remota;
- abertura de sessões Codex ou Claude em um diretório escolhido;
- console uniforme da aplicação para as sessões de runtime;
- terminal SSH bruto como ferramenta separada;
- várias sessões visíveis em abas ou painéis;
- nenhuma dependência obrigatória do `delta-runtime` no primeiro MVP.

O escopo consolidado, as decisões adotadas e as questões ainda abertas estão em [docs/product-brief.md](docs/product-brief.md).

## Relação com os outros repositórios

| Repositório | Responsabilidade |
|---|---|
| [`DEVxEAZY/Atlas`](https://github.com/DEVxEAZY/Atlas) | Interface desktop, fluxo de trabalho, SSH, Explorer e consoles. |
| [`DEVxEAZY/delta-runtime`](https://github.com/DEVxEAZY/delta-runtime) | Futuro gateway estruturado para controlar sessões nativas por API. |
| `motor-de-agentes` | Caderno de produto e arquitetura ampla; não é a implementação do Atlas. |

Atlas pode integrar o `delta-runtime` futuramente, mas os dois produtos permanecem independentes: o harness deve ser útil por SSH antes dessa integração.

## Princípio de eficiência

Atlas não pretende recriar o VS Code, fabricar um emulador de terminal ou antecipar uma plataforma de orquestração. O primeiro objetivo é provar um fluxo pessoal, remoto e confiável usando peças consolidadas para SSH, PTY e renderização de terminal.
