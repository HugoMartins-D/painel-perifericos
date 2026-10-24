export default function Stat({ rotulo, valor, unidade, cor, children }) {
  return (
    <div className="stat">
      <div className="k">{rotulo}</div>
      <div className="v" style={cor ? { color: cor } : undefined}>
        {valor}{unidade && <small> {unidade}</small>}
      </div>
      {children}
    </div>
  );
}

export const simNao = (b) => (b ? "Sim" : "Não");
