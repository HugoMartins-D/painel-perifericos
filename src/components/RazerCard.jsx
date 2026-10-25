import Stat, { simNao } from "./Stat.jsx";
import MouseTest from "./MouseTest.jsx";
import RazerControls from "./RazerControls.jsx";

function corBateria(pct) {
  if (pct <= 15) return "var(--bad)";
  if (pct <= 35) return "var(--warn)";
  return "var(--razer)";
}

function InfoMouse({ razer, carregando }) {
  if (!razer) return <div className="note">Lendo o mouse…</div>;
  if (!razer.ok) return <div className="msg">{razer.erro || "Não foi possível ler o mouse."}</div>;

  const bat = razer.bateriaPct;
  const cor = bat != null ? corBateria(bat) : undefined;
  return (
    <div style={{ opacity: carregando ? 0.5 : 1 }}>
      <div className="grid">
        <Stat rotulo="DPI atual" valor={razer.dpiX === razer.dpiY ? razer.dpiX : `${razer.dpiX} × ${razer.dpiY}`} />
        {razer.pollingHz && <Stat rotulo="Polling rate" valor={razer.pollingHz} unidade="Hz" />}
        {bat != null && (
          <Stat rotulo={`Bateria${razer.carregando ? " (carregando)" : ""}`} valor={bat} unidade="%" cor={cor}>
            <div className="bar"><i style={{ width: `${bat}%`, background: cor }} /></div>
          </Stat>
        )}
        {razer.desligarAposMin != null && <Stat rotulo="Desliga sozinho após" valor={razer.desligarAposMin} unidade="min" />}
        {razer.firmware && <Stat rotulo="Firmware" valor={razer.firmware} />}
        {razer.serial && <Stat rotulo="Nº de série" valor={<span className="serial">{razer.serial}</span>} />}
      </div>

      {razer.estagiosDpi && (
        <>
          <div className="note rotulo-estagios">Estágios de DPI (botão embaixo da roda)</div>
          <div className="stages">
            {razer.estagiosDpi.map((d, i) => (
              <span key={i} className={`stage ${i + 1 === razer.estagioAtivo ? "on" : ""}`}>{i + 1}: {d}</span>
            ))}
          </div>
        </>
      )}
      {bat != null && bat <= 15 && <p className="msg">Bateria fraca — troque a pilha do mouse.</p>}
    </div>
  );
}

export default function RazerCard({ dispositivo, razer, windows, carregando, aoAplicar }) {
  const nome = dispositivo?.nomes.find((n) => n.startsWith("Razer")) || "Mouse Razer";
  const m = windows?.mouse;
  return (
    <section className="razer">
      <h2>{nome}</h2>
      <div className="id">
        {dispositivo
          ? `USB ${dispositivo.vid}:${dispositivo.pid} · ${dispositivo.interfaces} interfaces · ${dispositivo.status}`
          : "procurando…"}
      </div>

      <h3>Configuração salva no mouse</h3>
      <InfoMouse razer={razer} carregando={carregando} />

      {razer?.ok && (
        <>
          <h3>Mudar configuração do mouse</h3>
          <RazerControls razer={razer} aoAplicar={aoAplicar} />
        </>
      )}

      <h3>Configuração do Windows para o mouse</h3>
      {m && (
        <div className="grid">
          <Stat rotulo="Velocidade do ponteiro" valor={m.velocidadePonteiro} unidade="/ 20" />
          <Stat rotulo="Aumentar precisão" valor={simNao(m.precisaoPonteiro)} />
          <Stat rotulo="Linhas por rolagem" valor={m.linhasRolagem} />
          <Stat rotulo="Duplo clique" valor={m.duploCliqueMs} unidade="ms" />
          <Stat rotulo="Botões invertidos" valor={simNao(m.botoesInvertidos)} />
          <Stat rotulo="Botões detectados" valor={m.numeroBotoes} />
        </div>
      )}

      <h3>Teste ao vivo</h3>
      <MouseTest />
    </section>
  );
}
