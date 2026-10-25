import Stat from "./Stat.jsx";

const NIVEL = {
  completo: { rotulo: "Lê e controla", classe: "nivel-completo" },
  leitura: { rotulo: "Lê a configuração", classe: "nivel-leitura" },
  basico: { rotulo: "Básico", classe: "nivel-basico" },
};

function Logitech({ dados }) {
  if (!dados) return null;
  if (!Array.isArray(dados)) return <div className="msg">Não consegui ler: {dados.erro}</div>;
  if (!dados.length) return <div className="note">Nenhum aparelho Logitech respondeu (pode estar desligado ou dormindo).</div>;
  return dados.map((a) => (
    <div key={a.slot} className="sub-aparelho">
      <div className="sub-nome">{a.nome || "Aparelho Logitech"} <span className="note">· {a.tipo} · {a.slot === "cabo" ? "cabo" : `receptor, slot ${a.slot}`}</span></div>
      <div className="grid">
        {a.bateriaPct != null && <Stat rotulo={`Bateria${a.carregando ? " (carregando)" : ""}`} valor={a.bateriaPct} unidade="%" />}
        {a.bateriaMv != null && <Stat rotulo="Bateria (tensão)" valor={(a.bateriaMv / 1000).toFixed(2)} unidade="V" />}
        {a.dpi != null && <Stat rotulo="DPI" valor={a.dpi} />}
        {a.pollingHz != null && <Stat rotulo="Polling rate" valor={a.pollingHz} unidade="Hz" />}
        {a.firmware && <Stat rotulo="Firmware" valor={<span className="menor">{a.firmware}</span>} />}
      </div>
    </div>
  ));
}

export default function PerifericosCard({ outros }) {
  return (
    <section className="full">
      <h2>Todos os periféricos conectados</h2>
      <p className="note">
        Qualquer mouse, teclado ou receptor aparece aqui com o nome que o próprio aparelho informa. Razer e Logitech
        têm a configuração lida; Marvo pelo app oficial; Redragon, Attack Shark, K-Snake e outras marcas são reconhecidas.
      </p>
      {!outros && <div className="note">Procurando aparelhos…</div>}
      {outros && !Array.isArray(outros) && <div className="msg">{outros.erro}</div>}
      <div className="perifericos">
        {Array.isArray(outros) && outros.map((p) => {
          const nivel = NIVEL[p.suporte.nivel];
          return (
            <article key={p.id} className="periferico">
              <header>
                <div>
                  <div className="p-nome">{p.modelo || p.nome}</div>
                  <div className="id">
                    {p.modelo && `${p.nome} · `}{p.id.startsWith("bt:") ? "Bluetooth" : `USB ${p.id}`}
                  </div>
                </div>
                <span className={`selo ${nivel.classe}`}>{nivel.rotulo}</span>
              </header>
              <div className="etiquetas">
                <span className="etiqueta marca">{p.marca}</span>
                {p.tipos.map((t) => <span key={t} className="etiqueta">{t}</span>)}
                <span className="etiqueta">{p.conexao}</span>
                {p.bateriaPct != null && <span className="etiqueta">Bateria {p.bateriaPct}%</span>}
              </div>
              <Logitech dados={p.logitech} />
              <p className="note">{p.suporte.texto}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
