import { useEffect, useState } from "react";

const POLLINGS = [125, 500, 1000];
const MINUTOS = [1, 2, 3, 5, 10, 15];

const doMouse = (razer) => ({
  estagios: razer.estagiosDpi?.length ? [...razer.estagiosDpi] : [razer.dpiX],
  estagioAtivo: razer.estagioAtivo || 1,
  pollingHz: razer.pollingHz || 1000,
  desligarAposMin: razer.desligarAposMin || 10,
});

export default function RazerControls({ razer, aoAplicar }) {
  const [form, setForm] = useState(() => doMouse(razer));
  const [estado, setEstado] = useState(null); // null | "gravando" | { ok, erro }

  useEffect(() => { setForm(doMouse(razer)); }, [razer]);

  const original = doMouse(razer);
  const normaliza = (f) => JSON.stringify({ ...f, estagios: f.estagios.map(Number) });
  const mudou = normaliza(form) !== normaliza(original);
  const muda = (campo, valor) => { setForm((f) => ({ ...f, [campo]: valor })); setEstado(null); };

  const mudaEstagio = (i, valor) => muda("estagios", form.estagios.map((d, j) => (j === i ? valor : d)));
  const removeEstagio = (i) => {
    const estagios = form.estagios.filter((_, j) => j !== i);
    setForm((f) => ({ ...f, estagios, estagioAtivo: Math.min(f.estagioAtivo > i + 1 ? f.estagioAtivo - 1 : f.estagioAtivo, estagios.length) }));
    setEstado(null);
  };

  const aplicar = async () => {
    setEstado("gravando");
    const r = await window.hardware.aplicarRazer({ ...form, estagios: form.estagios.map(Number) });
    setEstado(r);
    if (r.ok) aoAplicar();
  };

  return (
    <div className="controles">
      <div className="k note">Estágios de DPI — clique no círculo para escolher o ativo</div>
      <div className="estagios-edit">
        {form.estagios.map((d, i) => (
          <div key={i} className={`estagio-edit ${form.estagioAtivo === i + 1 ? "on" : ""}`}>
            <input type="radio" name="ativo" checked={form.estagioAtivo === i + 1}
              onChange={() => muda("estagioAtivo", i + 1)} aria-label={`Estágio ${i + 1} ativo`} />
            <span className="num">{i + 1}</span>
            <input type="number" min="100" max="16000" step="50" value={d}
              onChange={(e) => mudaEstagio(i, e.target.value)} aria-label={`DPI do estágio ${i + 1}`} />
            {form.estagios.length > 1 && (
              <button className="mini" onClick={() => removeEstagio(i)} title="Remover estágio">×</button>
            )}
          </div>
        ))}
        {form.estagios.length < 5 && (
          <button className="mini add" onClick={() => muda("estagios", [...form.estagios, 1600])}>+ estágio</button>
        )}
      </div>

      <div className="linha-controles">
        <label>Polling rate
          <select value={form.pollingHz} onChange={(e) => muda("pollingHz", Number(e.target.value))}>
            {POLLINGS.map((p) => <option key={p} value={p}>{p} Hz</option>)}
          </select>
        </label>
        <label>Desligar sem uso após
          <select value={form.desligarAposMin} onChange={(e) => muda("desligarAposMin", Number(e.target.value))}>
            {MINUTOS.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>

      <div className="linha-controles">
        <button className="primario" disabled={!mudou || estado === "gravando"} onClick={aplicar}>
          {estado === "gravando" ? "Gravando…" : "Aplicar no mouse"}
        </button>
        <button disabled={!mudou || estado === "gravando"} onClick={() => { setForm(original); setEstado(null); }}>Desfazer</button>
        {estado?.ok && <span className="sucesso">✓ Gravado na memória do mouse</span>}
      </div>
      {estado && estado.ok === false && <div className="msg">{estado.erro}</div>}
      <p className="note">
        As mudanças ficam salvas no próprio mouse. Se o Razer Synapse estiver aberto, ele pode trocar os valores
        de volta para o perfil dele.
      </p>
    </div>
  );
}
