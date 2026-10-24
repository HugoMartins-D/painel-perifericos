import Stat from "./Stat.jsx";
import KeyboardTest from "./KeyboardTest.jsx";

export default function MarvoCard({ dispositivo, windows }) {
  const t = windows?.teclado;
  return (
    <section className="marvo">
      <h2>Teclado Marvo</h2>
      <div className="id">
        {dispositivo
          ? `USB ${dispositivo.vid}:${dispositivo.pid} · ${dispositivo.fabricante} · ${dispositivo.interfaces} interfaces · ${dispositivo.status}`
          : "procurando…"}
      </div>

      <h3>Configuração do Windows para o teclado</h3>
      {t && (
        <div className="grid">
          <Stat rotulo="Atraso para repetir" valor={t.atrasoRepeticaoMs} unidade="ms" />
          <Stat rotulo="Velocidade de repetição" valor={t.taxaRepeticaoCps} unidade="teclas/s" />
          <Stat rotulo="Cursor pisca a cada" valor={t.piscarCursorMs} unidade="ms" />
        </div>
      )}
      <p className="note">
        A Marvo não publica o protocolo dos teclados, então a iluminação e as macros gravadas no teclado não
        podem ser lidas por outro programa — só pelo software oficial da Marvo. O que dá para ver está aqui:
        identificação, repetição de teclas e os testes abaixo.
      </p>

      <h3>Teste de teclas</h3>
      <KeyboardTest />
    </section>
  );
}
