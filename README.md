# 🎬 Filmuse — Editor de Vídeo Simples

Editor de vídeos fácil e prático, direto no navegador. Apenas os básicos de edição, sem complicação.

## ✨ Recursos

- **Importar vídeos** — arraste e solte ou clique para selecionar (MP4, MOV, WebM…)
- **Timeline visual** — veja todos os clipes, clique para selecionar, arraste as bordas para cortar
- **Cortar (Trim)** — ajuste início e fim de cada clipe com sliders ou arrastando na timeline
- **Velocidade** — 0.25× a 2× (câmera lenta ou acelerado)
- **Áudio** — volume e silenciar por clipe
- **Filtros** — 8 presets (Preto e Branco, Sépia, Vintage, Quente, Frio, Dramático, Suave) + ajuste fino de brilho, contraste, saturação, desfoque e matiz
- **Texto** — adicione título/legenda com cor, tamanho e posição
- **Orientação** — girar 90° e espelhar horizontalmente
- **Formatos** — 16:9 (YouTube), 9:16 (Stories/Reels/TikTok), 1:1 e 4:5
- **Exportar** — renderiza no navegador (Canvas + MediaRecorder) e baixa o arquivo final
- **Atalho** — `Espaço` para play/pause

Tudo roda 100% no navegador — nenhum vídeo é enviado para servidor.

## 🚀 Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## 🛠 Tecnologias

- React + Vite
- HTML5 Video / Canvas / MediaRecorder API

## 📦 Build

```bash
npm run build
```
