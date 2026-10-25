import Stat from "./Stat.jsx";
import KeyboardTest from "./KeyboardTest.jsx";
import KeyboardMap from "./KeyboardMap.jsx";

function Perfil({ marvo }) {
  if (!marvo) return <div className="note">Lendo o perfil da Marvo…</div>;
  if (!marvo.ok) return <div className="msg">{marvo.erro}</div>;
  const p = marvo.perfil;
  if (!p) return <div className="msg">{marvo.avisoPerfil}</div>;

  const salvo = p.efeitos.find((e) => e.indice === p.efeitoSalvo.indice);
  const fn = p.atalhosFn.filter((a) => a.camada === "Fn");
  return (
    <>
      <div className="grid">
        <Stat rotulo="Perfil" valor={p.nome} />
        <Stat rotulo="Efeito de luz salvo" valor={<span className="menor">{p.efeitoSalvo.nome}</span>} />
        {salvo?.brilho != null && <Stat rotulo="Brilho" valor={salvo.brilho} unidade="/ 4" />}
        {salvo?.velocidade != null && <Stat rotulo="Velocidade" valor={salvo.velocidade} unidade="/ 4" />}
        <Stat rotulo="Teclas remapeadas" valor={p.remapeadas.length} />
        {marvo.dormirAposSeg && <Stat rotulo="Dorme sem uso (sem fio)" valor={marvo.dormirAposSeg / 60} unidade="min" />}
      </div>
      <div className="note" style={{ marginTop: 6 }}>
        Salvo pelo app da Marvo em {new Date(p.atualizadoEm).toLocaleString("pt-BR")}
      </div>

      <h3>Cores das teclas</h3>
      <KeyboardMap teclas={marvo.teclas} cores={p.coresTeclas} />
      <p className="note">
        {Object.keys(p.coresTeclas).length
          ? `${Object.keys(p.coresTeclas).length} teclas com cor própria no modo Personalizado.`
          : "Nenhuma tecla com cor própria."}
      </p>

      <h3>Ajustes de cada efeito de luz</h3>
      <div className="efeitos">
        {p.efeitos.map((e) => (
          <div key={e.indice} className={`efeito ${e.indice === p.efeitoSalvo.indice ? "on" : ""}`}>
            <span className="nome">{e.nome}</span>
            <span className="det">
              {e.brilho != null && `brilho ${e.brilho}`}
              {e.velocidade != null && ` · veloc. ${e.velocidade}`}
            </span>
            {e.colorido === true && <span className="arco" title="Colorido" />}
            {e.colorido === false && <span className="bolinha" style={{ background: e.cor }} title={e.cor} />}
          </div>
        ))}
      </div>

      <h3>Atalhos com a tecla Fn</h3>
      <table className="fn">
        <tbody>
          {fn.map((a) => (
            <tr key={a.tecla}><td><kbd>Fn</kbd> + <kbd>{a.tecla}</kbd></td><td>{a.funcao}</td></tr>
          ))}
        </tbody>
      </table>
      {p.remapeadas.length > 0 && (
        <>
          <h3>Teclas remapeadas</h3>
          <table className="fn"><tbody>
            {p.remapeadas.map((r) => <tr key={r.tecla}><td><kbd>{r.tecla}</kbd></td><td>{r.para}</td></tr>)}
          </tbody></table>
        </>
      )}
    </>
  );
}

export default function MarvoCard({ dispositivo, windows, marvo }) {
  const t = windows?.teclado;
  const modelo = marvo?.ok ? `Teclado Marvo ${marvo.modelo}` : "Teclado Marvo";
  return (
    <section className="marvo">
      <h2>{modelo}</h2>
      <div className="id">
        {dispositivo
          ? `USB ${dispositivo.vid}:${dispositivo.pid} · ${dispositivo.interfaces} interfaces · ${dispositivo.status}`
          : "procurando…"}
        {marvo?.ok && ` · sem fio ${marvo.usb.semFio} / cabo ${marvo.usb.cabo}`}
      </div>

      <h3>Configuração salva no app da Marvo</h3>
      <Perfil marvo={marvo} />

      <h3>Configuração do Windows para o teclado</h3>
      {t && (
        <div className="grid">
          <Stat rotulo="Atraso para repetir" valor={t.atrasoRepeticaoMs} unidade="ms" />
          <Stat rotulo="Velocidade de repetição" valor={t.taxaRepeticaoCps} unidade="teclas/s" />
          <Stat rotulo="Cursor pisca a cada" valor={t.piscarCursorMs} unidade="ms" />
        </div>
      )}

      <h3>Teste de teclas</h3>
      <KeyboardTest />
    </section>
  );
}
