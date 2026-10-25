// Todos os mouses, teclados e receptores conectados, com o nome que o próprio aparelho informa.
// Reconhece a marca e diz o que o painel consegue ler de cada um.
const HID = require("node-hid");
const { execFile } = require("node:child_process");
const { lerLogitech } = require("./logitech.cjs");

// Marcas pelo nome que o aparelho informa (várias marcas chinesas usam os mesmos chips/VIDs,
// então o nome é mais confiável que o VID).
const MARCAS_POR_NOME = [
  [/redragon/i, "Redragon"],
  [/attack\s*shark/i, "Attack Shark"],
  [/k-?snake/i, "K-Snake"],
  [/marvo/i, "Marvo"],
  [/logitech|logi\b|g\s?pro|lightspeed|unifying|bolt receiver/i, "Logitech"],
  [/razer/i, "Razer"],
  [/hyperx/i, "HyperX"],
  [/corsair/i, "Corsair"],
  [/steelseries/i, "SteelSeries"],
  [/glorious/i, "Glorious"],
  [/zowie/i, "Zowie"],
  [/fortrek/i, "Fortrek"],
  [/havit/i, "Havit"],
  [/aula/i, "Aula"],
  [/8bitdo/i, "8BitDo"],
];
const MARCAS_POR_VID = {
  0x046d: "Logitech", 0x1532: "Razer", 0x1b1c: "Corsair", 0x1038: "SteelSeries", 0x0951: "HyperX", 0x03f0: "HyperX",
  0x258a: "chip SINO WEALTH", 0x04d9: "chip Holtek", 0x0c45: "chip Microdia", 0x1a2c: "chip China Resource",
  0x3554: "chip CX (Compx)", 0x1d57: "chip Xenta", 0x248a: "chip Maxxter", 0x25a7: "chip Areson", 0x2dc8: "8BitDo",
  0x320f: "chip Evision", 0x05ac: "Apple", 0x045e: "Microsoft",
};
// Marcas que usam chips genéricos: o modelo pode ser Redragon, Attack Shark, K-Snake, Marvo…
const VIDS_GENERICOS = new Set([0x258a, 0x04d9, 0x0c45, 0x1a2c, 0x3554, 0x1d57, 0x248a, 0x25a7, 0x320f]);

const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, "0");

function tipoPorUso(usos, nome) {
  const t = new Set();
  for (const [pagina, uso] of usos) {
    if (pagina === 1 && uso === 2) t.add("Mouse");
    if (pagina === 1 && uso === 6) t.add("Teclado");
    if (pagina === 1 && (uso === 4 || uso === 5)) t.add("Controle");
  }
  if (/receiver|receptor|dongle|2\.4g/i.test(nome)) return ["Receptor", ...t];
  // Mouses expõem uma interface de teclado (macros) e teclados uma de mouse: o nome desempata.
  if (t.has("Mouse") && t.has("Teclado")) {
    if (/mouse|basilisk|basilsk|viper|deathadder|naga|mamba|orochi|g\d{3}|mx (master|anywhere)|pulsefire|rival|sensei|model [od]/i.test(nome)) t.delete("Teclado");
    else if (/keyboard|teclado|\bkb\b|k\d{2,3}|keychron|kumara|apex|alloy/i.test(nome)) t.delete("Mouse");
  }
  if (/headset|audio|fone/i.test(nome) && !t.size) t.add("Áudio");
  return [...t];
}

function conexao(caminhos) {
  if (caminhos.some((p) => /00001124|00001812|bth/i.test(p))) return "Bluetooth";
  return "USB";
}

function bateriasBluetooth() {
  // DEVPKEY_Bluetooth_Battery: o Windows guarda a bateria de aparelhos Bluetooth que informam o nível.
  const script =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-PnpDevice -PresentOnly -Class Bluetooth -ErrorAction SilentlyContinue | ForEach-Object { " +
    "$b = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue; " +
    "if ($b -and $b.Data -ne $null) { [pscustomobject]@{ nome = $_.FriendlyName; bateria = [int]$b.Data } } } | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, encoding: "utf8", timeout: 15000 }, (err, out) => {
        if (err || !out.trim()) return resolve([]);
        try { const r = JSON.parse(out); resolve(Array.isArray(r) ? r : [r]); } catch { resolve([]); }
      });
  });
}

function suporte(marca, vid) {
  if (marca === "Razer") return { nivel: "completo", texto: "Lê e controla DPI, estágios, polling, bateria e tempo para desligar (seção do mouse Razer)." };
  if (marca === "Logitech") return { nivel: "leitura", texto: "Lê nome, bateria, DPI, polling e firmware pelo protocolo HID++." };
  if (marca === "Marvo") return { nivel: "leitura", texto: "Lê o perfil salvo pelo app oficial da Marvo (seção do teclado Marvo)." };
  if (["Redragon", "Attack Shark", "K-Snake"].includes(marca) || VIDS_GENERICOS.has(vid)) {
    return { nivel: "basico", texto: "Marca reconhecida. A configuração interna (DPI, luz, macros) ainda não é lida: cada modelo dessas marcas usa comandos próprios, e dá para adicionar com uma gravação USB do aparelho." };
  }
  return { nivel: "basico", texto: "Mostra nome, tipo e conexão. Os testes ao vivo do painel funcionam com ele." };
}

// conhecidos: { "VID:PID": "Marca Modelo" } vindos dos apps oficiais instalados (ex.: Marvo).
async function outrosPerifericos(conhecidos = {}) {
  const todos = HID.devices();
  const grupos = new Map();
  for (const d of todos) {
    if (d.vendorId == null) continue;
    const chave = `${hex4(d.vendorId)}:${hex4(d.productId)}`;
    if (!grupos.has(chave)) grupos.set(chave, { vid: d.vendorId, pid: d.productId, nomes: new Set(), fabricantes: new Set(), usos: [], caminhos: [] });
    const g = grupos.get(chave);
    if (d.product) g.nomes.add(d.product.trim());
    if (d.manufacturer) g.fabricantes.add(d.manufacturer.trim());
    g.usos.push([d.usagePage, d.usage]);
    g.caminhos.push(d.path || "");
  }

  const [logitech, baterias] = await Promise.all([
    lerLogitech(todos).catch((e) => ({ erro: e.message })),
    bateriasBluetooth(),
  ]);

  const lista = [];
  for (const [chave, g] of grupos) {
    const nome = [...g.nomes][0] || "Sem nome";
    const fabricante = [...g.fabricantes][0] || "";
    const texto = `${fabricante} ${nome}`;
    const tipos = tipoPorUso(g.usos, nome);
    if (!tipos.length) continue; // só mouses, teclados, controles, receptores e áudio
    const conhecido = conhecidos[chave];
    const marca = conhecido ? conhecido.split(" ")[0]
      : (MARCAS_POR_NOME.find(([re]) => re.test(texto)) || [])[1] || MARCAS_POR_VID[g.vid] || fabricante || "Desconhecida";
    const item = {
      id: chave, nome, fabricante, marca, modelo: conhecido || null, tipos, conexao: conexao(g.caminhos), suporte: suporte(marca, g.vid),
    };
    if (marca === "Logitech" && logitech[chave]) item.logitech = logitech[chave];
    const bt = baterias.find((b) => b.nome && (b.nome.includes(nome) || nome.includes(b.nome)));
    if (bt) item.bateriaPct = bt.bateria;
    lista.push(item);
  }
  // Aparelhos Bluetooth com bateria que não apareceram na lista HID
  for (const b of baterias) {
    if (!lista.some((i) => i.bateriaPct === b.bateria && (i.nome.includes(b.nome) || b.nome.includes(i.nome)))) {
      lista.push({ id: `bt:${b.nome}`, nome: b.nome, fabricante: "", marca: (MARCAS_POR_NOME.find(([re]) => re.test(b.nome)) || [])[1] || "Bluetooth",
        tipos: ["Bluetooth"], conexao: "Bluetooth", bateriaPct: b.bateria, suporte: { nivel: "basico", texto: "Bateria informada pelo Windows." } });
    }
  }
  const ordem = { completo: 0, leitura: 1, basico: 2 };
  return lista.sort((a, b) => ordem[a.suporte.nivel] - ordem[b.suporte.nivel] || a.marca.localeCompare(b.marca));
}

module.exports = { outrosPerifericos };
