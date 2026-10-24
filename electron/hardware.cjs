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

module.exports = { configWindows, dispositivos, configRazer };
