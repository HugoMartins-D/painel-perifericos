import { useCallback, useEffect, useState } from "react";
import RazerCard from "./components/RazerCard.jsx";
import MarvoCard from "./components/MarvoCard.jsx";
import PerifericosCard from "./components/PerifericosCard.jsx";
import icone from "./icon.png";

export default function App() {
  const [dados, setDados] = useState({ dispositivos: null, windows: null, razer: null, marvo: null, outros: null });
  const [carregando, setCarregando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const hw = window.hardware;
    // Razer e Logitech abrem o HID em sequência para não disputarem o mesmo aparelho.
    const [dispositivos, windows, marvo] = await Promise.all([hw.dispositivos(), hw.windows(), hw.marvo()]);
    const razer = await hw.razer();
    const outros = await hw.outros();
    setDados({ dispositivos, windows, razer, marvo, outros });
    setAtualizadoEm(new Date());
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Depois de gravar no mouse, relê só o Razer para mostrar os valores que ficaram salvos.
  const recarregarRazer = useCallback(async () => {
    const razer = await window.hardware.razer();
    setDados((d) => ({ ...d, razer }));
  }, []);

  const lista = Array.isArray(dados.dispositivos) ? dados.dispositivos : [];
  const razerDev = lista.find((d) => d.vid === "1532");
  const marvoDev = lista.find((d) => d.fabricante.startsWith("Marvo"))
    || lista.find((d) => d.vid !== "1532" && d.tipos.includes("Teclado"));

  return (
    <>
      <header className="topo">
        <img className="logo" src={icone} alt="" />
        <div>
          <h1>Painel de Periféricos</h1>
          <div className="sub">Mostra a configuração atual — nada é alterado nos aparelhos.</div>
        </div>
        <div className="espaco" />
        {atualizadoEm && <span className="sub">Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR")}</span>}
        <button onClick={carregar} disabled={carregando}>{carregando ? "Lendo…" : "Atualizar dados"}</button>
      </header>

      <main>
        <RazerCard dispositivo={razerDev} razer={dados.razer} windows={dados.windows} carregando={carregando}
          aoAplicar={recarregarRazer} />
        <MarvoCard dispositivo={marvoDev} windows={dados.windows} marvo={dados.marvo} />
        <PerifericosCard outros={dados.outros} />
      </main>
    </>
  );
}
