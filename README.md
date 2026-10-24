# Painel de Periféricos

Programa para Windows (React + Electron) que mostra a configuração do mouse Razer e do teclado Marvo.
Só lê informações — nada é gravado nos aparelhos.

## Baixar

**[⬇ Baixar a versão mais recente](https://github.com/HugoMartins-D/painel-perifericos/releases/latest)**

Na página de download:

- **Painel-de-Perifericos-Instalador-1.0.0.exe** — instala no PC, cria atalho na Área de Trabalho e no Menu Iniciar.
- **Painel-de-Perifericos-Portatil-1.0.0.exe** — abre direto, sem instalar (a primeira abertura demora uns 20–30 s).

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

- `electron/hardware.cjs` — lê o Windows (user32) e o mouse Razer (hid.dll, protocolo openrazer) via koffi
- `electron/main.cjs` / `preload.cjs` — janela do app e ponte segura para a tela
- `src/` — a tela em React (`App.jsx` e `components/`)
