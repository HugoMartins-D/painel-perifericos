// Leitura de periféricos Logitech pelo protocolo HID++ 2.0 (documentado pelo projeto Solaar).
// Só comandos de LEITURA. Funciona com aparelhos por cabo e por receptor (Unifying, Bolt, Lightspeed).
const HID = require("node-hid");

const LOGITECH = 0x046d;
const SW_ID = 0x0a; // identifica nossas mensagens nas respostas
const TIPOS = ["Teclado", "Controle remoto", "Teclado numérico", "Mouse", "Touchpad", "Trackball", "Apresentador", "Receptor", "Headset"];
const TAXA_8061 = [125, 250, 500, 1000, 2000, 4000, 8000];

class Canal {
  constructor(dispositivo) { this.d = dispositivo; }

  static async abrir(caminho) { return new Canal(await HID.HIDAsync.open(caminho)); }

  // Envia um relatório longo (0x11) e espera a resposta da mesma função.
  async chamar(indice, funcIdx, func, params = [], timeout = 250) {
    const msg = [0x11, indice, funcIdx, (func << 4) | SW_ID, ...params];
    while (msg.length < 20) msg.push(0);
    await this.d.write(msg);
    const limite = Date.now() + timeout;
    while (Date.now() < limite) {
      const r = await this.d.read(Math.max(1, limite - Date.now()));
      if (!r || !r.length) continue;
      if (r[1] !== indice) continue;
      if (r[2] === 0xff && r[3] === funcIdx) return null; // erro HID++ 2.0
      if (r[0] === 0x10 && r[2] === 0x8f) return null; // erro HID++ 1.0 (sem aparelho no slot)
      if (r[2] === funcIdx && r[3] === ((func << 4) | SW_ID)) return r.slice(4);
    }
    return null;
  }

  async indiceRecurso(indice, recurso) {
    const r = await this.chamar(indice, 0x00, 0, [recurso >> 8, recurso & 0xff]);
    return r && r[0] ? r[0] : null;
  }

  fechar() { try { this.d.close(); } catch {} }
}

async function lerAparelho(canal, indice) {
  // Ping (IRoot.getProtocolVersion): confirma que há um aparelho HID++ 2.0 nesse slot.
  const ping = await canal.chamar(indice, 0x00, 1, [0, 0, 0xaa], 300);
  if (!ping || ping[0] < 2) return null;
  const info = { slot: indice === 0xff ? "cabo" : indice, protocolo: `${ping[0]}.${ping[1]}` };

  const nomeIdx = await canal.indiceRecurso(indice, 0x0005);
  if (nomeIdx) {
    const total = (await canal.chamar(indice, nomeIdx, 0))?.[0] || 0;
    let nome = "";
    while (nome.length < total) {
      const parte = await canal.chamar(indice, nomeIdx, 1, [nome.length]);
      if (!parte) break;
      nome += Buffer.from(parte.slice(0, total - nome.length)).toString("latin1");
    }
    info.nome = nome.replace(/\0+$/, "") || null;
    const tipo = await canal.chamar(indice, nomeIdx, 2);
    if (tipo) info.tipo = TIPOS[tipo[0]] || `Tipo ${tipo[0]}`;
  }

  const fwIdx = await canal.indiceRecurso(indice, 0x0003);
  if (fwIdx) {
    const entidades = (await canal.chamar(indice, fwIdx, 0))?.[0] || 0;
    for (let e = 0; e < entidades; e++) {
      const fw = await canal.chamar(indice, fwIdx, 1, [e]);
      if (fw && fw[0] === 0) { // 0 = firmware principal
        const prefixo = Buffer.from(fw.slice(1, 4)).toString("latin1").replace(/\0/g, "");
        info.firmware = `${prefixo} ${fw[4].toString(16).padStart(2, "0")}.${fw[5].toString(16).padStart(2, "0")}`;
        break;
      }
    }
  }

  // Bateria: tenta o recurso novo (0x1004), depois o antigo (0x1000), depois tensão (0x1001).
  const unificada = await canal.indiceRecurso(indice, 0x1004);
  if (unificada) {
    const b = await canal.chamar(indice, unificada, 1);
    if (b) { info.bateriaPct = b[0]; info.carregando = [1, 2].includes(b[2]); }
  } else {
    const antiga = await canal.indiceRecurso(indice, 0x1000);
    if (antiga) {
      const b = await canal.chamar(indice, antiga, 0);
      if (b) { info.bateriaPct = b[0]; info.carregando = [1, 2, 3].includes(b[2]); }
    } else {
      const tensao = await canal.indiceRecurso(indice, 0x1001);
      if (tensao) {
        const b = await canal.chamar(indice, tensao, 0);
        if (b) { info.bateriaMv = (b[0] << 8) | b[1]; info.carregando = (b[2] & 0x80) !== 0; }
      }
    }
  }

  const dpiIdx = await canal.indiceRecurso(indice, 0x2201);
  if (dpiIdx) {
    const d = await canal.chamar(indice, dpiIdx, 2, [0]);
    if (d) info.dpi = (d[1] << 8) | d[2];
  }

  const taxaExt = await canal.indiceRecurso(indice, 0x8061);
  if (taxaExt) {
    const t = await canal.chamar(indice, taxaExt, 2);
    if (t) info.pollingHz = TAXA_8061[t[0]];
  } else {
    const taxa = await canal.indiceRecurso(indice, 0x8060);
    if (taxa) {
      const t = await canal.chamar(indice, taxa, 1);
      if (t && t[0]) info.pollingHz = Math.round(1000 / t[0]);
    }
  }
  return info;
}

// Lê todos os aparelhos Logitech: o próprio aparelho (cabo) ou até 6 ligados a um receptor.
async function lerLogitech(dispositivosHid) {
  const canais = dispositivosHid.filter((d) => d.vendorId === LOGITECH && d.usagePage === 0xff00 && d.usage === 2);
  const resultado = {};
  for (const c of canais) {
    let canal;
    try {
      canal = await Canal.abrir(c.path);
      const aparelhos = [];
      for (const indice of [0xff, 1, 2, 3, 4, 5, 6]) {
        const a = await lerAparelho(canal, indice);
        if (a) aparelhos.push(a);
      }
      resultado[`046D:${c.productId.toString(16).toUpperCase().padStart(4, "0")}`] = aparelhos;
    } catch (e) {
      resultado[`046D:${c.productId.toString(16).toUpperCase().padStart(4, "0")}`] = { erro: e.message };
    } finally {
      canal?.fechar();
    }
  }
  return resultado;
}

module.exports = { lerLogitech };
