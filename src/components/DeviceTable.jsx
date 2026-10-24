export default function DeviceTable({ dispositivos }) {
  return (
    <section className="full">
      <h2>Todos os mouses e teclados conectados</h2>
      <table>
        <thead>
          <tr><th>Aparelho</th><th>Fabricante</th><th>Tipo</th><th>VID:PID</th><th>Interfaces</th><th>Status</th></tr>
        </thead>
        <tbody>
          {!dispositivos && <tr><td colSpan={6} className="note">Carregando…</td></tr>}
          {dispositivos && !Array.isArray(dispositivos) && (
            <tr><td colSpan={6} className="msg">{dispositivos.erro}</td></tr>
          )}
          {Array.isArray(dispositivos) && dispositivos.map((d) => (
            <tr key={`${d.vid}:${d.pid}`}>
              <td>{d.nome}</td>
              <td>{d.fabricante}</td>
              <td>{d.tipos.join(" + ")}</td>
              <td className="id">{d.vid}:{d.pid}</td>
              <td>{d.interfaces}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
