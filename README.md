# 🎬 Filmuse — Estúdio de Edição no Navegador

Editor de vídeos rápido, intuitivo e moderno inspirado no **Microsoft Clipchamp**, rodando **100% no seu navegador** (nenhum arquivo é enviado para servidores externos).

## ✨ Recursos

- **🤖 Ajudante de IA Integrado (`Ctrl + I`)** — Copiloto conversacional + ações rápidas com 1 clique que executa edições reais no projeto em linguagem natural: criar **capa** (e baixar em PNG), **introdução animada**, **tela final**, **cortar/dividir trechos**, **adaptar para Reels/TikTok 9:16**, **aplicar filtros/efeitos**, **adicionar música de fundo** e **Edição Mágica completa** (100% grátis localmente, com suporte opcional a chave de API externa).
- **Layout Estúdio estilo Clipchamp** — Barra lateral esquerda retrátil (Ajudante IA, Mídia, Gravar, Texto, Áudio/SFX, Transições e Fundos), palco interativo central, inspetor contextual à direita e timeline multi-faixas.
- **Timeline Multi-Faixas com Alinhamento Magnético (Snap)**:
  - **Faixa de Texto e Adesivos** — múltiplos títulos, legendas animadas e emojis posicionáveis livremente no tempo e na tela.
  - **Faixa de Camada / Picture-in-Picture (PiP)** — sobreponha vídeos, logos, fotos ou webcam circular com borda e sombra.
  - **Faixa de Vídeo Principal** — storyline magnética com *filmstrip* (tira de miniaturas), reordenação por arraste e corte nas bordas.
  - **Faixa de Áudio Dedicada** — ondas sonoras (*waveform*) reais, volume até 200%, *fade in / fade out* e separação de áudio de vídeos.
- **Dividir na Agulha (`S`) & Desfazer/Refazer (`Ctrl+Z` / `Ctrl+Y`)** — corte erros no meio do clipe em um clique e navegue pelo histórico completo de edições.
- **Gravar e Criar direto no navegador**:
  - **Tela e Câmera** (grava a tela na faixa principal + webcam circular editável em PiP)
  - **Gravação de Tela**, **Gravação de Webcam** e **Narração de Voz (Voiceover)** com visualizador ao vivo.
- **Transições Suaves entre Cenas** — Dissolver (*Crossfade*), Escurecer, Flash Branco, Deslizar, Zoom Dinâmico e Cortina (*Wipe*).
- **Filtros, Cores & Enquadramento Inteligente**:
  - 12 presets cinematográficos + exposição, contraste, saturação, matiz, vinheta, desfoque e opacidade.
  - **Fundo Desfocado (*Blur Fill*)** — ideal para transformar vídeos 16:9 em 9:16 (Reels / TikTok / Shorts).
  - Movimento de câmera *Ken Burns* em fotos e vídeos + recorte livre com grade dos terços.
- **Trilhas e Efeitos Sonoros Integrados** — efeitos e loops sintetizados prontos para ouvir e adicionar sem sair do editor.
- **Exportação Rápida em MP4 (480p / 720p / 1080p, até 60 fps)** — renderização acelerada quadro a quadro via **WebCodecs + `mp4-muxer`** com mixagem de áudio multi-faixas (`OfflineAudioContext`) e fallback automático via `MediaRecorder`.

## ⌨️ Atalhos Rápidos

| Atalho | Ação |
| --- | --- |
| `Ctrl + I` | Abrir Ajudante de IA |
| `Espaço` ou `K` | Reproduzir / Pausar |
| `S` | Dividir clipe na agulha (*Split*) |
| `Delete` / `Backspace` | Excluir item selecionado |
| `Ctrl + Z` / `Ctrl + Y` | Desfazer / Refazer |
| `Ctrl + D` | Duplicar item selecionado |
| `←` / `→` | Voltar / avançar 1 quadro (`Shift` = 1s) |
| `J` / `L` | Voltar / avançar 5 segundos |
| `+` / `-` | Zoom na timeline |

## 🚀 Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## 📦 Build de Produção

```bash
npm run build
```
