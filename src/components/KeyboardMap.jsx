// Desenha o teclado com as posições do KB.ini do app da Marvo e pinta as teclas com cor própria.
const ROTULOS = {
  Backspace: "⌫", CapsLock: "Caps", LShift: "Shift", RShift: "Shift", LCtrl: "Ctrl", RCtrl: "Ctrl",
  LWin: "Win", LAlt: "Alt", RAlt: "Alt", FN: "Fn", Space: "", Delete: "Del", Up: "↑", Down: "↓",
  Left: "←", Right: "→", Enter: "Enter", "><": "\\", Mute: "",
};

export default function KeyboardMap({ teclas, cores }) {
  const visiveis = teclas.filter((t) => t.rect[2] > t.rect[0]);
  const largura = Math.max(...visiveis.map((t) => t.rect[2])) + 14;
  const altura = Math.max(...visiveis.map((t) => t.rect[3])) + 14;
  return (
    <svg className="teclado" viewBox={`10 10 ${largura - 10} ${altura - 10}`} role="img" aria-label="Cores das teclas">
      {visiveis.map((t) => {
        const [x1, y1, x2, y2] = t.rect;
        const cor = cores[t.n];
        const rotulo = ROTULOS[t.nome] ?? t.nome;
        return (
          <g key={t.n}>
            <rect x={x1 + 1} y={y1 + 1} width={x2 - x1 - 2} height={y2 - y1 - 2} rx="5"
              fill={cor || "var(--tile)"} stroke={cor ? "none" : "var(--line)"} />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle"
              fill={cor ? "#fff" : "var(--muted)"} fontSize={rotulo.length > 3 ? 9 : 11}>{rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
