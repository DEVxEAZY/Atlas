# Atlas v0 — brief vivo de produto

**Estado:** em descoberta arquitetural  
**Início:** 17 de setembro de 2026

## Objetivo

Reduzir o atrito de trabalhar em uma VPS com vários domínios, workspaces, repositórios e sessões de coding agents. O operador deve conseguir entrar em um domínio, navegar pela árvore Linux real, escolher um diretório e abrir Codex, Claude ou um terminal SSH sem alternar manualmente entre IDE, cliente SSH e várias janelas desconectadas.

Atlas v0 é um harness de interface e controle de processos por SSH. Ele não depende da API customizada do `delta-runtime` e não tenta substituir as sessões nativas dos runtimes.

## Decisões adotadas

### Produto e execução

1. Atlas v0 será um aplicativo desktop para Windows.
2. A interface executa localmente; a VPS continua sendo o ambiente de trabalho remoto.
3. Credenciais SSH não entram no renderer nem no estado visual da aplicação.
4. O primeiro momento usa SSH, terminal e controle de processos. A integração com `delta-runtime` é posterior e opcional.

### Estrutura de trabalho

1. Um **Domínio de Trabalho** aponta para um diretório Linux real.
2. Novos domínios seguem o basename `@nome-em-kebab-case`, por exemplo `@megavale-repos` e `@development`.
3. O nome exibido é separado do basename físico, por exemplo `Mega Vale` para `@megavale-repos`.
4. Um **Workspace** é um subdiretório real e opcional, salvo como bookmark porque agrupa trabalho relacionado.
5. Novos workspaces usam `kebab-case` sem `@`, por exemplo `plk-workflow`.
6. Repositórios Git podem existir diretamente no domínio ou dentro de workspaces.
7. O filesystem remoto permanece como fonte de verdade; Atlas não mantém uma árvore paralela no banco.

### Entrada e Explorer do Domínio

1. Ao abrir o aplicativo, Atlas pode restaurar o último domínio válido ou mostrar o catálogo de domínios.
2. **Criar domínio** cria um diretório real sob uma raiz permitida e registra o bookmark.
3. **Adicionar domínio existente** registra o path sem mover, copiar ou renomear seu conteúdo.
4. Ao entrar em um domínio, a interface fica focalizada naquele universo de trabalho.
5. A barra lateral apresenta a árvore remota em um Explorer inspirado na manipulação de arquivos do VS Code, sem transformar Atlas em uma IDE completa.
6. Repositórios são detectados por Git. Um workspace é reconhecido quando o path coincide com um bookmark registrado, nunca apenas pelo nome da pasta.

### Sessão e terminal

1. Na experiência do usuário, uma **Sessão** é um runtime escolhido trabalhando em um diretório definido.
2. A ação **Nova sessão** oferece Codex ou Claude.
3. O clique padrão inicia na raiz do domínio atual. O usuário pode escolher outra pasta.
4. O seletor trabalha com diretórios reais; Atlas classifica o path como Domínio, Workspace, Repositório ou Pasta.
5. A sessão é apresentada por um **console uniforme da aplicação**, com aparência de terminal.
6. O console é a superfície visual; ele não deve ser tratado como a identidade durável da conversa nativa.
7. **Abrir terminal** cria um shell SSH bruto e permanece uma ação separada de **Nova sessão**.
8. Várias sessões podem ser visualizadas em abas ou painéis paralelos.

## Fluxo principal aceito

```text
abrir Atlas
  -> restaurar último domínio válido ou escolher domínio
  -> navegar na árvore Linux real
  -> Nova sessão
       -> escolher Codex ou Claude
       -> usar raiz do domínio ou escolher pasta
       -> Atlas classifica o diretório
       -> abrir console uniforme

Ação independente
  -> Abrir terminal
  -> iniciar shell SSH bruto no diretório selecionado
```

## Limite do primeiro MVP

### Incluído

- cadastrar uma conexão SSH pessoal;
- criar ou adicionar um domínio dentro de roots permitidos;
- listar a árvore remota sob demanda;
- detectar bookmarks de workspace e top-levels Git;
- abrir uma sessão Codex ou Claude no diretório selecionado;
- abrir um shell SSH independente;
- exibir mais de um console e alternar entre eles;
- reconectar ou informar falhas de conexão sem esconder o estado do operador.

### Não construir agora

- API compatível com OpenAI Responses;
- gateway próprio dentro do Atlas;
- equipes, roteador LLM, missões automáticas ou subagentes;
- Simplificador, Vetorizador ou Design Observatory;
- editor de código completo, Git UI ou busca indexada;
- multiusuário, RBAC ou compartilhamento de credenciais;
- sincronização de arquivos, upload genérico, `chmod` ou `chown` pela interface;
- movimentação entre domínios;
- observabilidade estruturada equivalente ao futuro `delta-runtime`.

## Questões abertas antes do scaffold

1. Escolher a base desktop: Electron ou Tauri.
2. Definir se a persistência inicial de processos remotos usará `tmux` ou se o primeiro corte será explicitamente efêmero.
3. Definir o comportamento de fechar um painel: ocultar/desacoplar, encerrar processo ou perguntar conforme o estado.
4. Definir se uma pasta comum vira um escopo próprio ou apenas um `cwd` dentro do repositório/workspace reconhecido.
5. Delimitar as mutações do Explorer e sua política de recuperação antes de permitir mover, renomear ou excluir.
6. Definir como o Atlas reutilizará `~/.ssh/config`, `known_hosts` e agentes de chave do Windows.

## Critério de prova do v0

Em uma máquina Windows e uma única VPS, o operador consegue:

1. cadastrar uma conexão sem expor a chave ao renderer;
2. adicionar `@development` como domínio;
3. navegar até um repositório ou workspace real;
4. abrir Codex ou Claude naquele diretório;
5. interagir pelo console uniforme;
6. abrir um terminal SSH bruto em paralelo;
7. alternar entre pelo menos duas sessões sem misturar entrada ou saída.

## Continuidade

A especificação e a implementação do harness continuam neste repositório. O caderno `motor-de-agentes` permanece como referência do ecossistema amplo, enquanto o desenvolvimento da API customizada continua separado em `delta-runtime`.
