// Leitura de hardware (somente leitura — nada é gravado no mouse ou no teclado).
// Usa koffi para chamar as DLLs do Windows (user32, kernel32, hid) direto do Node.
const koffi = require("koffi");
const { execFile } = require("node:child_process");

// Fabricantes conhecidos (Vendor ID USB)
const FABRICANTES = {
  "1532": "Razer",
  "3554": "Marvo (chip CX / Compx)",
  "1A2C": "Marvo (chip China Resource)",
  "258A": "Marvo (chip SINO WEALTH)",
  "0C45": "Marvo (chip Microdia)",
  "2DC8": "8BitDo",
  "12D1": "Huawei",
  "046D": "Logitech",
};

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const hidDll = koffi.load("hid.dll");

const SystemParametersInfoW = user32.func("bool __stdcall SystemParametersInfoW(uint action, uint param, _Out_ void *buf, uint winIni)");
const GetDoubleClickTime = user32.func("uint __stdcall GetDoubleClickTime()");
const GetCaretBlinkTime = user32.func("uint __stdcall GetCaretBlinkTime()");
const GetSystemMetrics = user32.func("int __stdcall GetSystemMetrics(int index)");

const CreateFileW = kernel32.func("void * __stdcall CreateFileW(str16 path, uint32 access, uint32 share, void *sec, uint32 disp, uint32 flags, void *tmpl)");
const CloseHandle = kernel32.func("bool __stdcall CloseHandle(void *h)");
const HidD_GetPreparsedData = hidDll.func("bool __stdcall HidD_GetPreparsedData(void *h, _Out_ void **data)");
const HidD_FreePreparsedData = hidDll.func("bool __stdcall HidD_FreePreparsedData(void *data)");
const HidP_GetCaps = hidDll.func("long __stdcall HidP_GetCaps(void *data, _Out_ void *caps)");
const HidD_SetFeature = hidDll.func("bool __stdcall HidD_SetFeature(void *h, void *buf, ulong len)");
const HidD_GetFeature = hidDll.func("bool __stdcall HidD_GetFeature(void *h, _Inout_ void *buf, ulong len)");

const GUID_HID = "{4d1e55b2-f16f-11cf-88cb-001111000030}";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function spiInt(acao) {
  const b = Buffer.alloc(4);
  SystemParametersInfoW(acao, 0, b, 0);
  return b.readInt32LE(0);
}

function powershell(script) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (err, out) => (err ? reject(err) : resolve(out.trim())));
  });
}

// ---------------------------------------------------------------- Windows
function configWindows() {
  const acel = Buffer.alloc(12);
  SystemParametersInfoW(0x0003, 0, acel, 0); // SPI_GETMOUSE
  const delay = spiInt(0x0016); // SPI_GETKEYBOARDDELAY 0..3
  const speed = spiInt(0x000a); // SPI_GETKEYBOARDSPEED 0..31
  return {
    mouse: {
      velocidadePonteiro: spiInt(0x0070), // 1..20
      precisaoPonteiro: acel.readInt32LE(8) !== 0,
      linhasRolagem: spiInt(0x0068),
      duploCliqueMs: GetDoubleClickTime(),
      botoesInvertidos: GetSystemMetrics(23) !== 0,
      numeroBotoes: GetSystemMetrics(43),
    },
    teclado: {
      atrasoRepeticaoMs: 250 * (delay + 1),
      taxaRepeticaoCps: Math.round((2.5 + speed * (27.5 / 31)) * 10) / 10,
      piscarCursorMs: GetCaretBlinkTime(),
    },
  };
}

async function dispositivos() {
  const out = await powershell(
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in 'Mouse','Keyboard','HIDClass' " +
    "-and $_.InstanceId -match 'VID_' } | Select-Object Class,FriendlyName,InstanceId,Status | ConvertTo-Json -Compress");
  let itens = out ? JSON.parse(out) : [];
  if (!Array.isArray(itens)) itens = [itens];
  const grupos = new Map();
  for (const d of itens) {
    const iid = d.InstanceId.toUpperCase();
    const m = iid.match(/VID_([0-9A-F]{4}).*PID_([0-9A-F]{4})/);
    if (!m) continue;
    const [, vid, pid] = m;
    const chave = `${vid}:${pid}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, { vid, pid, fabricante: FABRICANTES[vid] || "Desconhecido",
        nomes: new Set(), tipos: new Set(), interfaces: 0, status: d.Status });
    }
    const g = grupos.get(chave);
    g.interfaces++;
    if (d.Class === "Mouse") g.tipos.add("Mouse");
    if (d.Class === "Keyboard") g.tipos.add("Teclado");
    const nome = d.FriendlyName || "";
    if (nome && !/compat|dispositivo|hid-compliant/i.test(nome)) g.nomes.add(nome);
  }
  return [...grupos.values()]
    .filter((g) => g.tipos.size)
    .map((g) => ({ ...g, nomes: [...g.nomes].sort(), tipos: [...g.tipos].sort(),
      nome: [...g.nomes].sort().join(", ") || `${g.fabricante} (sem nome)` }))
    .sort((a, b) => (a.fabricante !== "Razer") - (b.fabricante !== "Razer") || a.fabricante.localeCompare(b.fabricante));
}

// ---------------------------------------------------------------- Razer (HID)
// Protocolo de 90 bytes documentado pelo projeto openrazer. Só comandos de LEITURA.
const invalido = (h) => !h || koffi.address(h) === 0xffffffffffffffffn;

async function abrirRazer() {
  const out = await powershell(
    "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'HID\\VID_1532*' } | Select-Object -ExpandProperty InstanceId");
  const caminhos = out.split(/\r?\n/).filter(Boolean)
    .map((l) => "\\\\?\\" + l.trim().replace(/\\/g, "#") + "#" + GUID_HID);
  for (const caminho of caminhos) {
    let h = CreateFileW(caminho, 0xc0000000, 3, null, 3, 0, null);
    if (invalido(h)) h = CreateFileW(caminho, 0, 3, null, 3, 0, null);
    if (invalido(h)) continue;
    const pp = [null];
    let tamanho = 0;
    if (HidD_GetPreparsedData(h, pp)) {
      const caps = Buffer.alloc(64);
      HidP_GetCaps(pp[0], caps);
      tamanho = caps.readUInt16LE(8); // FeatureReportByteLength
      HidD_FreePreparsedData(pp[0]);
    }
    if (tamanho === 91) return h;
    CloseHandle(h);
  }
  return null;
}

async function comando(h, tid, classe, cmd, tamanho, args = []) {
  const rel = Buffer.alloc(91); // byte 0 = report ID
  rel[2] = tid;
  rel[6] = tamanho; rel[7] = classe; rel[8] = cmd;
  args.forEach((v, i) => (rel[9 + i] = v));
  let crc = 0;
  for (let i = 3; i < 89; i++) crc ^= rel[i];
  rel[89] = crc;
  if (!HidD_SetFeature(h, rel, 91)) return null;
  for (let t = 0; t < 10; t++) {
    await espera(30);
    const r = Buffer.alloc(91);
    if (!HidD_GetFeature(h, r, 91)) return null;
    if (r[1] === 0x02 && r[7] === classe && r[8] === cmd) return r.subarray(9, 89); // sucesso
    if ([0x03, 0x04, 0x05].includes(r[1])) return null; // falha / tempo / não suportado
  }
  return null;
}

async function configRazer() {
  const h = await abrirRazer();
  if (!h) {
    return { ok: false, erro: "Não consegui abrir a interface de configuração do Razer. " +
      "Feche o Razer Synapse e tente de novo, ou o mouse pode estar desligado." };
  }
  try {
    const info = { ok: true };
    let tid = null;
    for (const t of [0x1f, 0xff, 0x3f]) { // HyperSpeed usa 0x1F; outros modelos 0xFF/0x3F
      const dpi = await comando(h, t, 0x04, 0x85, 0x07, [0x01]);
      if (dpi) {
        tid = t;
        info.dpiX = dpi.readUInt16BE(1);
        info.dpiY = dpi.readUInt16BE(3);
        break;
      }
    }
    if (tid === null) return { ok: false, erro: "O mouse não respondeu (pode estar dormindo — mexa nele e atualize)." };

    const estagios = await comando(h, tid, 0x04, 0x86, 0x26, [0x01]);
    if (estagios && estagios[2]) {
      info.estagioAtivo = estagios[1];
      info.estagiosDpi = Array.from({ length: Math.min(estagios[2], 5) }, (_, i) => estagios.readUInt16BE(4 + i * 7));
    }
    const polling = await comando(h, tid, 0x00, 0x85, 0x01);
    if (polling) info.pollingHz = { 1: 1000, 2: 500, 4: 250, 8: 125 }[polling[0]];
    const bateria = await comando(h, tid, 0x07, 0x80, 0x02);
    if (bateria) info.bateriaPct = Math.round((bateria[1] / 255) * 100);
    const carregando = await comando(h, tid, 0x07, 0x84, 0x02);
    if (carregando) info.carregando = carregando[1] !== 0;
    const fw = await comando(h, tid, 0x00, 0x81, 0x02);
    if (fw) info.firmware = `v${fw[0]}.${fw[1]}`;
    const serial = await comando(h, tid, 0x00, 0x82, 0x16);
    if (serial) info.serial = serial.subarray(0, 22).toString("ascii").split("\0")[0];
    const sono = await comando(h, tid, 0x07, 0x83, 0x02);
    if (sono) info.desligarAposMin = Math.floor(sono.readUInt16BE(0) / 60);
    return info;
  } finally {
    CloseHandle(h);
  }
}

// Gravação no mouse Razer (mesmos comandos do openrazer, salvos na memória do mouse).
const DPI_MIN = 100, DPI_MAX = 16000;
const POLLING_CODIGO = { 1000: 0x01, 500: 0x02, 125: 0x08 };
const be16 = (v) => [(v >> 8) & 0xff, v & 0xff];

function validarRazer({ estagios, estagioAtivo, pollingHz, desligarAposMin }) {
  if (!Array.isArray(estagios) || estagios.length < 1 || estagios.length > 5) throw new Error("Use de 1 a 5 estágios de DPI.");
  const dpis = estagios.map((d) => Math.round(Number(d) / 50) * 50);
  if (dpis.some((d) => !(d >= DPI_MIN && d <= DPI_MAX))) throw new Error(`O DPI precisa ficar entre ${DPI_MIN} e ${DPI_MAX}.`);
  if (!(estagioAtivo >= 1 && estagioAtivo <= dpis.length)) throw new Error("Estágio ativo inválido.");
  if (!(pollingHz in POLLING_CODIGO)) throw new Error("Polling rate inválido.");
  if (!(desligarAposMin >= 1 && desligarAposMin <= 15)) throw new Error("O tempo para desligar precisa ficar entre 1 e 15 minutos.");
  return { dpis, estagioAtivo, pollingHz, desligarAposMin };
}

async function aplicarRazer(pedido) {
  const cfg = validarRazer(pedido);
  const h = await abrirRazer();
  if (!h) return { ok: false, erro: "Não consegui abrir o mouse. Feche o Razer Synapse e tente de novo." };
  try {
    let tid = null;
    for (const t of [0x1f, 0xff, 0x3f]) {
      if (await comando(h, t, 0x04, 0x85, 0x07, [0x01])) { tid = t; break; }
    }
    if (tid === null) return { ok: false, erro: "O mouse não respondeu (pode estar dormindo — mexa nele e tente de novo)." };

    const falhas = [];
    // Estágios: [armazenar, ativo, quantidade, depois 7 bytes por estágio: nº, X, Y, 0, 0]
    const args = [0x01, cfg.estagioAtivo, cfg.dpis.length];
    cfg.dpis.forEach((d, i) => args.push(i, ...be16(d), ...be16(d), 0, 0));
    if (!(await comando(h, tid, 0x04, 0x06, 0x26, args))) falhas.push("estágios de DPI");
    const ativo = cfg.dpis[cfg.estagioAtivo - 1];
    if (!(await comando(h, tid, 0x04, 0x05, 0x07, [0x01, ...be16(ativo), ...be16(ativo), 0, 0]))) falhas.push("DPI atual");
    if (!(await comando(h, tid, 0x00, 0x05, 0x01, [POLLING_CODIGO[cfg.pollingHz]]))) falhas.push("polling rate");
    if (!(await comando(h, tid, 0x07, 0x03, 0x02, be16(cfg.desligarAposMin * 60)))) falhas.push("tempo para desligar");
    if (falhas.length) return { ok: false, erro: `O mouse recusou: ${falhas.join(", ")}.` };
    return { ok: true };
  } finally {
    CloseHandle(h);
  }
}

// ---------------------------------------------------------------- Marvo (perfil do app oficial)
// Formato descoberto por engenharia reversa do "MARVO KG985W Driver" (OemDrv.exe):
//  - Dev\kb\KB.ini descreve o teclado: teclas [KEY] (retângulo, código padrão, nº do LED),
//    atalhos Fn de fábrica [FN1] e a lista de efeitos de luz (LedOptN).
//  - %LOCALAPPDATA%\BYCOMBO4\<Title>\profile.dct guarda o perfil salvo pelo app:
//      0x000C  nome do perfil (UTF-16)
//      0x003F  camada normal: 16 bytes por tecla Kn  [tipo, modificador, código VK, …]
//      0x093F  camada Fn1:   16 bytes por tecla Kn  [0x09, …, função uint32 LE em +5]
//      0x123F  camada Fn2:   idem
//      0x2440  efeito de luz salvo (índice LedOpt)
//      0x244B  cores personalizadas: 4 bytes por tecla Kn  [0, R, G, B]
//      0x2F8B  ajustes de cada efeito: 36 bytes  [0, brilho, velocidade, colorido, 8 × (0,R,G,B)]
const fs = require("node:fs");
const pathMod = require("node:path");

const EFEITOS_MARVO = [
  "", "Fixo", "Respiração", "Arco-íris", "Flash", "Gotas de chuva", "Roda arco-íris", "Ondas brilhantes",
  "Estrelas piscando", "Sombra sumindo", "Cobrinha retrô", "Neon", "Reação ao toque", "Onda senoidal",
  "Varredura", "Moinho girando", "Cascata colorida", "Florescer", "Tempestade girando", "Personalizado", "Desligado",
];

const HID_TECLAS = {
  0x28: "Enter", 0x29: "Esc", 0x2a: "Backspace", 0x2b: "Tab", 0x2c: "Espaço", 0x2d: "-", 0x2e: "=", 0x2f: "[",
  0x30: "]", 0x31: "\\", 0x33: ";", 0x34: "'", 0x35: "`", 0x36: ",", 0x37: ".", 0x38: "/", 0x39: "CapsLock",
  0x46: "PrintScreen", 0x47: "ScrollLock", 0x48: "Pause", 0x49: "Insert", 0x4a: "Home", 0x4b: "PgUp", 0x4c: "Delete",
  0x4d: "End", 0x4e: "PgDn", 0x4f: "→", 0x50: "←", 0x51: "↓", 0x52: "↑",
};
const nomeHid = (k) => {
  if (k >= 0x04 && k <= 0x1d) return String.fromCharCode(0x41 + k - 0x04);
  if (k >= 0x1e && k <= 0x26) return String(k - 0x1d);
  if (k === 0x27) return "0";
  if (k >= 0x3a && k <= 0x45) return `F${k - 0x39}`;
  return HID_TECLAS[k] || `tecla 0x${k.toString(16)}`;
};
const MULTIMIDIA = {
  0x6f: "Brilho da tela +", 0x70: "Brilho da tela −", 0xb5: "Próxima faixa", 0xb6: "Faixa anterior", 0xb7: "Parar",
  0xcd: "Tocar / pausar", 0xe2: "Mudo", 0xe9: "Volume +", 0xea: "Volume −", 0x183: "Player de mídia", 0x18a: "E-mail",
  0x192: "Calculadora", 0x194: "Meu computador", 0x221: "Pesquisar", 0x223: "Página inicial", 0x22a: "Favoritos",
};
const LUZ = { 0x0800: "Trocar efeito de luz", 0x0803: "Brilho da luz", 0x0804: "Velocidade da luz" };

function nomeFuncaoFn(v) {
  const tipo = v >>> 24;
  if (tipo === 0x02) return MULTIMIDIA[v & 0xffff] || `Multimídia (0x${(v & 0xffff).toString(16)})`;
  if (tipo === 0x00) {
    const mods = (v >>> 16) & 0xff;
    const nomes = [[0x01, "Ctrl"], [0x02, "Shift"], [0x04, "Alt"], [0x08, "Win"]].filter(([b]) => mods & b).map(([, n]) => n);
    return [...nomes, nomeHid(v & 0xff)].join(" + ");
  }
  if (tipo === 0x08) {
    const grupo = (v >>> 16) & 0xffff;
    const dir = (v >>> 8) & 0xff;
    const base = LUZ[grupo] || `Controle de luz (0x${grupo.toString(16)})`;
    return dir === 1 ? `${base} +` : dir === 2 ? `${base} −` : base;
  }
  if (tipo === 0x07) return `Função interna do teclado (0x${(v & 0xff).toString(16)})`;
  return `0x${v.toString(16)}`;
}

const NOMES_MODIFICADOR = { 0x01: "LCtrl", 0x02: "LShift", 0x04: "LAlt", 0x08: "LWin", 0x10: "RCtrl", 0x20: "RShift", 0x40: "RAlt", 0x80: "RWin" };

function lerIni(caminho) {
  const secoes = {};
  let atual = null, comentario = null;
  for (const linha of fs.readFileSync(caminho, "latin1").split(/\r?\n/)) {
    const s = linha.trim();
    const sec = s.match(/^\[(.+)\]$/);
    if (sec) { atual = secoes[sec[1]] = { valores: {}, comentarios: {} }; continue; }
    if (!atual) continue;
    if (s.startsWith(";")) { comentario = s.slice(1).trim(); continue; }
    const kv = s.match(/^([^=\/]+?)\s*=\s*(.*)$/);
    if (kv) {
      atual.valores[kv[1]] = kv[2];
      if (comentario) atual.comentarios[kv[1]] = comentario;
      comentario = null;
    }
  }
  return secoes;
}

async function pastaMarvo() {
  const out = await powershell(
    "Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue " +
    "| Where-Object { $_.DisplayName -match 'MARVO' -and $_.InstallLocation } | Select-Object -First 1 -ExpandProperty InstallLocation");
  const candidatos = [out.trim()];
  for (const raiz of ["C:\\Program Files (x86)", "C:\\Program Files"]) {
    try { for (const d of fs.readdirSync(raiz)) if (/^MARVO/i.test(d)) candidatos.push(pathMod.join(raiz, d)); } catch {}
  }
  return candidatos.find((c) => c && fs.existsSync(pathMod.join(c, "Dev", "kb", "KB.ini"))) || null;
}

async function configMarvo() {
  const pasta = await pastaMarvo();
  if (!pasta) return { ok: false, erro: "O programa oficial da Marvo não foi encontrado neste PC." };

  const kb = lerIni(pathMod.join(pasta, "Dev", "kb", "KB.ini"));
  const cfg = lerIni(pathMod.join(pasta, "Cfg.ini"));
  const opt = kb.OPT.valores;
  const titulo = cfg.OPT?.valores.Title || opt.Name;
  const appdir = cfg.OPT?.valores.Appdir || "BYCOMBO4";

  // Teclas do layout (KB.ini): Kn = x1,y1,x2,y2, tipo, VK, ?, nº LED
  const teclas = Object.entries(kb.KEY.valores).map(([k, v]) => {
    const p = v.split(",").map((x) => parseInt(x.trim(), x.trim().startsWith("0x") ? 16 : 10));
    return { n: Number(k.slice(1)), nome: kb.KEY.comentarios[k] || k, rect: p.slice(0, 4), vkPadrao: p[5], led: p[7] };
  }).sort((a, b) => a.n - b.n);

  const info = {
    ok: true,
    modelo: opt.ShortName || opt.Name,
    nomeDriver: titulo,
    pasta,
    usb: { cabo: `${(opt.VID || "").replace("0x", "").toUpperCase()}:${(opt.PID || "").replace("0x", "").toUpperCase()}`,
      semFio: `${(opt.VID_Wireless || "").replace("0x", "").toUpperCase()}:${(opt.PID_Wireless || "").replace("0x", "").toUpperCase()}` },
    firmwareEsperado: opt.Fw,
    dormirAposSeg: opt.SleepTime ? Number(opt.SleepTime) : null,
    teclas: teclas.map(({ n, nome, rect }) => ({ n, nome, rect })),
  };

  const arqPerfil = pathMod.join(process.env.LOCALAPPDATA, appdir, titulo, "profile.dct");
  if (!fs.existsSync(arqPerfil)) {
    info.perfil = null;
    info.avisoPerfil = "O app da Marvo ainda não salvou nenhum perfil neste PC.";
    return info;
  }
  const b = fs.readFileSync(arqPerfil);
  const u32 = (o) => b.readUInt32LE(o);

  const perfil = {
    nome: b.subarray(0x0c, 0x3c).toString("utf16le").split("\0")[0],
    atualizadoEm: fs.statSync(arqPerfil).mtime.toISOString(),
    remapeadas: [],
    atalhosFn: [],
    coresTeclas: {},
  };

  for (const t of teclas) {
    // Camada normal: compara com o padrão de fábrica
    const r = 0x3f + 16 * (t.n - 1);
    if (r + 16 <= b.length && b[r] === 0x02) {
      const mod = b[r + 1], vk = b[r + 2];
      const atual = mod ? NOMES_MODIFICADOR[mod] : vk;
      const padraoMod = [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0x5b, 0x5c].includes(t.vkPadrao);
      if (!padraoMod && vk !== t.vkPadrao) perfil.remapeadas.push({ tecla: t.nome, para: `VK 0x${vk.toString(16)}` });
      if (padraoMod && !mod) perfil.remapeadas.push({ tecla: t.nome, para: `VK 0x${atual.toString(16)}` });
    } else if (r + 16 <= b.length && b[r] === 0x00 && b.subarray(r, r + 16).every((x) => x === 0)) {
      perfil.remapeadas.push({ tecla: t.nome, para: "Desativada" });
    }
    // Camadas Fn1 / Fn2
    for (const [camada, base] of [["Fn", 0x93f], ["Fn2", 0x123f]]) {
      const o = base + 16 * (t.n - 1);
      if (o + 16 <= b.length && b[o] === 0x09) {
        perfil.atalhosFn.push({ camada, tecla: t.nome, funcao: nomeFuncaoFn(u32(o + 5)) });
      }
    }
    // Cores personalizadas
    const c = 0x244b + 4 * (t.n - 1);
    if (c + 4 <= b.length && (b[c + 1] || b[c + 2] || b[c + 3])) {
      perfil.coresTeclas[t.n] = `#${b.subarray(c + 1, c + 4).toString("hex")}`;
    }
  }

  // Efeitos de luz (LedOpt1..20 do KB.ini, na mesma ordem dos blocos de 36 bytes)
  const efeitoSalvo = b[0x2440];
  perfil.efeitoSalvo = { indice: efeitoSalvo, nome: EFEITOS_MARVO[efeitoSalvo] || `Efeito ${efeitoSalvo}` };
  perfil.efeitos = [];
  for (let i = 1; i <= 20; i++) {
    const ledOpt = (opt[`LedOpt${i}`] || "").split(",").map((x) => Number(x.trim()));
    const o = 0x2f8b + 36 * (i - 1);
    if (o + 36 > b.length || !ledOpt[0] && i !== 20) continue;
    const [, , temVelocidade, temBrilho, , , temCor] = ledOpt;
    perfil.efeitos.push({
      indice: i,
      nome: EFEITOS_MARVO[i],
      brilho: temBrilho ? b[o + 1] : null,
      velocidade: temVelocidade ? b[o + 2] : null,
      colorido: temCor ? b[o + 3] === 1 : null,
      cor: temCor ? `#${b.subarray(o + 5, o + 8).toString("hex")}` : null,
    });
  }
  info.perfil = perfil;
  return info;
}

// IDs USB do teclado Marvo instalado (cabo e receptor), para reconhecê-lo na lista geral.
async function idsMarvo() {
  const pasta = await pastaMarvo();
  if (!pasta) return {};
  const opt = lerIni(pathMod.join(pasta, "Dev", "kb", "KB.ini")).OPT.valores;
  const id = (v, p) => v && p ? `${v.replace("0x", "").toUpperCase().padStart(4, "0")}:${p.replace("0x", "").toUpperCase().padStart(4, "0")}` : null;
  const nome = `Marvo ${opt.ShortName || ""}`.trim();
  return Object.fromEntries([id(opt.VID, opt.PID), id(opt.VID_Wireless, opt.PID_Wireless)].filter(Boolean).map((k) => [k, nome]));
}

module.exports = { configWindows, dispositivos, configRazer, aplicarRazer, configMarvo, idsMarvo };
