# Painel de Periféricos

Programa para Windows (React + Electron) que mostra a configuração do mouse Razer e do teclado Marvo.
Lê a configuração dos dois aparelhos e permite mudar DPI, estágios, polling rate e tempo para desligar do mouse Razer.

## Baixar

**[⬇ Baixar a versão mais recente](https://github.com/HugoMartins-D/painel-perifericos/releases/latest)**

Na página de download:

- **Painel-de-Perifericos-Instalador-1.2.0.exe** — instala no PC, cria atalho na Área de Trabalho e no Menu Iniciar.
- **Painel-de-Perifericos-Portatil-1.2.0.exe** — abre direto, sem instalar (a primeira abertura demora uns 20–30 s).

Se o mouse não for lido, feche o Razer Synapse ou mexa no mouse e clique em **Atualizar dados**.

## Desenvolver

```bash
npm install
npm run dev      # abre o app com recarregamento automático
npm run dist     # gera os .exe em release/
```

O `npm run dist` precisa rodar numa pasta com caminho curto (ex.: `C:\dev\painel-perifericos`):
o gerador do instalador (NSIS) falha quando o caminho da pasta é muito longo.

## Estrutura

- `electron/hardware.cjs` — lê o Windows (user32), o mouse Razer (hid.dll, protocolo openrazer) via koffi
  e o perfil salvo pelo app oficial da Marvo (`profile.dct`)
- `electron/main.cjs` / `preload.cjs` — janela do app e ponte segura para a tela
- `src/` — a tela em React (`App.jsx` e `components/`)

## Como a leitura do teclado Marvo foi descoberta

Seguindo a ideia do [REA (Reverse Engineer Anything)](https://github.com/morluto/rea), o app oficial
"MARVO KG985W Driver" foi inspecionado sem código-fonte:

- `Dev\kb\KB.ini` descreve o teclado: posição de cada tecla, nº do LED, atalhos Fn de fábrica e a lista de efeitos.
- `%LOCALAPPDATA%\BYCOMBO4\MARVO KG985W Driver\profile.dct` é o perfil salvo. Mapa dos campos:

| Posição | Conteúdo |
|---|---|
| `0x000C` | nome do perfil (UTF-16) |
| `0x003F` | camada normal — 16 bytes por tecla `[tipo, modificador, código VK, …]` |
| `0x093F` / `0x123F` | camadas Fn1 / Fn2 — 16 bytes por tecla, função em `+5` (uint32) |
| `0x2440` | efeito de luz salvo |
| `0x244B` | cores personalizadas — 4 bytes por tecla `[0, R, G, B]` |
| `0x2F8B` | ajustes de cada efeito — 36 bytes `[0, brilho, velocidade, colorido, 8 cores]` |

O painel só **lê** esse arquivo; nada é enviado ao teclado. Os campos foram identificados comparando o
arquivo com a configuração atual, então alguns códigos das funções internas (Fn + Q/W/E/R etc.) ainda aparecem em hexadecimal.
