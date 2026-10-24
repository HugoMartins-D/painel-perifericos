import { useState } from "react";
import Stat from "./Stat.jsx";

const nomeTecla = (e) => (e.key === " " ? "Espaço" : e.key.length === 1 ? e.key.toUpperCase() : e.key);

export default function KeyboardTest() {
  const [segurando, setSegurando] = useState(() => new Map());
  const [testadas, setTestadas] = useState(() => new Set());
  const [maxRoll, setMaxRoll] = useState(0);
  const [log, setLog] = useState([]);

  const onKeyDown = (e) => {
    e.preventDefault();
    if (e.repeat) return;
    const n = new Map(segurando).set(e.code, nomeTecla(e));
    setSegurando(n);
    setMaxRoll((m) => Math.max(m, n.size));
    setTestadas((s) => new Set(s).add(e.code));
    setLog((l) => [`↓ ${e.code}   key="${e.key}"   código=${e.keyCode}`, ...l].slice(0, 60));
  };
  const onKeyUp = (e) => {
    e.preventDefault();
    setSegurando((s) => { const n = new Map(s); n.delete(e.code); return n; });
  };

  return (
    <>
      <input
        type="text"
        className="campo"
        placeholder="Clique aqui e aperte as teclas…"
        autoComplete="off"
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setSegurando(new Map())}
      />
      <div className="grid" style={{ marginTop: 10 }}>
        <Stat rotulo="Teclas seguradas agora" valor={segurando.size} />
        <Stat rotulo="Máximo ao mesmo tempo" valor={maxRoll} />
        <Stat rotulo="Teclas diferentes testadas" valor={testadas.size} />
      </div>
      <div className="kb">
        {[...segurando.entries()].map(([code, nome]) => <kbd key={code}>{nome}</kbd>)}
      </div>
      <div className="log">{log.map((linha, i) => <div key={i}>{linha}</div>)}</div>
      <p className="note">
        Dica: segure várias teclas juntas para descobrir o anti-ghosting (rollover). Teclas como Fn e as do modo
        gamer são tratadas pelo próprio teclado e não chegam ao Windows.
      </p>
    </>
  );
}
