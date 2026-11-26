import React from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  ['Ctrl + I', 'Abrir Ajudante de IA'],
  ['Espaço ou K', 'Reproduzir / Pausar'],
  ['S', 'Dividir clipe na agulha (Split)'],
  ['Delete / Backspace', 'Excluir item selecionado'],
  ['Ctrl + Z', 'Desfazer última ação'],
  ['Ctrl + Y / Ctrl + Shift + Z', 'Refazer ação'],
  ['Ctrl + D', 'Duplicar item selecionado'],
  ['← / →', 'Voltar / avançar 1 quadro'],
  ['Shift + ← / →', 'Voltar / avançar 1 segundo'],
  ['J / L', 'Voltar / avançar 5 segundos'],
  ['Home / End', 'Ir para o início / fim do projeto'],
  ['+ / -', 'Aumentar / diminuir zoom da timeline'],
  ['Duplo clique no texto', 'Editar texto direto no palco'],
]

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="cc-modal-backdrop" onClick={onClose}>
      <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-top">
          <div>
            <h2>Atalhos de teclado</h2>
            <p>Edite com muito mais agilidade usando atalhos rápidos estilo Clipchamp.</p>
          </div>
          <button className="cc-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cc-shortcuts-list">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="cc-shortcut-row">
              <span>{desc}</span>
              <kbd>{keys}</kbd>
            </div>
          ))}
        </div>

        <div className="cc-modal-footer">
          <button className="cc-btn cc-btn-export" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
