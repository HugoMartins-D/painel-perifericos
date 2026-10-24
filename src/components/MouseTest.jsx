import { useEffect, useRef, useState } from "react";
import Stat from "./Stat.jsx";

const BOTOES = [
  ["0", "Esquerdo"], ["1", "Meio"], ["2", "Direito"],
  ["3", "Lateral trás"], ["4", "Lateral frente"], ["up", "Roda ↑"], ["down", "Roda ↓"],
];

export default function MouseTest() {
  const pad = useRef(null);
  const eventos = useRef([]);
  const [hz, setHz] = useState(null);
  const [hzMax, setHzMax] = useState(0);
  const [roda, setRoda] = useState(0);
  const [testados, setTestados] = useState(() => new Set());
  const [apertados, setApertados] = useState(() => new Set());

  const marcar = (b, down) => {
    setTestados((s) => new Set(s).add(String(b)));
    setApertados((s) => { const n = new Set(s); down ? n.add(String(b)) : n.delete(String(b)); return n; });
  };

  // Mede a taxa real de eventos de movimento (polling) na janela dos últimos 500 ms.
  useEffect(() => {
    const id = setInterval(() => {
      const agora = performance.now();
      const ev = (eventos.current = eventos.current.filter((t) => agora - t < 500));
      if (ev.length < 10) return setHz(null);
      const medido = Math.round(ev.length / ((ev[ev.length - 1] - ev[0]) / 1000));
      setHz(medido);
      setHzMax((m) => Math.max(m, medido));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // A roda precisa de listener não-passivo para impedir a rolagem da página.
  useEffect(() => {
    const el = pad.current;
    const onWheel = (e) => {
      e.preventDefault();
      const b = e.deltaY > 0 ? "down" : "up";
      setRoda((r) => r + (e.deltaY > 0 ? 1 : -1));
      marcar(b, true);
      setTimeout(() => marcar(b, false), 120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <>
      <div
        ref={pad}
        className="pad"
        onPointerMove={(e) => {
          const lista = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
          for (const c of lista) eventos.current.push(c.timeStamp);
        }}
        onMouseDown={(e) => { e.preventDefault(); marcar(e.button, true); }}
        onMouseUp={(e) => { e.preventDefault(); marcar(e.button, false); }}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      >
        Mexa o mouse rápido aqui dentro<br />e clique / role com todos os botões
      </div>
      <div className="grid" style={{ marginTop: 10 }}>
        <Stat rotulo="Polling medido" valor={hz ?? "—"} unidade="Hz" />
        <Stat rotulo="Pico medido" valor={hzMax || "—"} unidade="Hz" />
        <Stat rotulo="Rolagem" valor={roda} />
      </div>
      <div className="btns">
        {BOTOES.map(([b, nome]) => (
          <span key={b} className={`${testados.has(b) ? "ok" : ""} ${apertados.has(b) ? "down" : ""}`}>{nome}</span>
        ))}
      </div>
    </>
  );
}
