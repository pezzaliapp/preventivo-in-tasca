/* Analisi mensile dei costi di trasporto (portata da calcolo-trasporti, analisi.js).
   Legge il file Excel solo nel browser: nessun dato esce dal computer.
   Differenze dall'originale: percorsi dei dati e chiave del divisore con prefisso pit_. */
"use strict";

const $ = (id) => document.getElementById(id);
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const eur = (v) => Number.isFinite(v) ? v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—";
const eur2 = (v) => Number.isFinite(v) ? v.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
const pct = (v, dec = 0) => Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { maximumFractionDigits: dec, minimumFractionDigits: dec })}%` : "—";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const up = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const dIt = (d) => d ? d.toLocaleDateString("it-IT") : "—";
const mKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mLabel = (k) => { const [y, m] = k.split("-"); return `${MESI[+m - 1]} ${y}`; };

let ROWS = [];         // spedizioni normalizzate
let REF = { pallet: null, geo: null };

/* ---------------- Lettura file ---------------- */
function parseMoney(v){
  if(v == null || v === "") return { val: null, note: null };
  if(typeof v === "number") return { val: v, note: null };
  const s = String(v).toLowerCase();
  if(/usd|\$|chf|gbp/.test(s)) return { val: null, note: `importo in valuta: "${v}"` };
  const nums = s.replace(/\./g, "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
  if(!nums) return { val: null, note: `importo non leggibile: "${v}"` };
  const val = nums.reduce((a, n) => a + parseFloat(n), 0);
  return { val, note: nums.length > 1 ? `più importi sommati: "${v}"` : null };
}
function parseDate(v){
  if(v instanceof Date && !isNaN(v)) return v;
  if(typeof v === "number" && v > 20000) return new Date(Math.round((v - 25569) * 864e5));
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(String(v ?? "").trim());
  if(m){ const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  return null;
}

function readWorkbook(wb){
  const out = [];
  for(const name of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = rows.findIndex((r) => r && r.some((c) => up(c).startsWith("DATA")));
    if(hi < 0) continue;
    const H = rows[hi].map(up);
    const find = (...keys) => H.findIndex((h) => keys.some((k) => h.startsWith(k)));
    const cV = find("VETTORE");
    const cDoc = cV === 0 ? 1 : 0;
    const cData = find("DATA");
    const cDest = find("MITTENTE", "DESTINATARIO");
    const cLoc = find("LOCALITA", "NAZIONE");
    const cKg = find("PESO");
    const cServ = find("SERVIZI");
    const cCli = find("CLIENTE");
    // costo: colonna "COSTO…" se presente, altrimenti quella subito dopo CLIENTE
    let cCost = H.findIndex((h) => h.startsWith("COSTO"));
    if(cCost < 0 && cCli >= 0) cCost = cCli + 1;
    const cNote = find("NOTE");
    const cTipo = H.findIndex((h) => /TIPO.*PALLET|^PALLET$|^TIPO$/.test(h));
    const cNum = H.findIndex((h) => /^N\.? ?PALLET|NUMERO PALLET|^N\.? PLT|^PLT$/.test(h));
    const estero = H.some((h) => h.startsWith("NAZIONE"));

    for(let i = hi + 1; i < rows.length; i++){
      const r = rows[i];
      if(!r || !r.some((c) => c !== null && c !== "")) continue;
      const cost = parseMoney(r[cCost]);
      const cli = parseMoney(r[cCli]);
      const note = r[cNote] != null ? String(r[cNote]).trim() : "";
      const dest = r[cDest] != null ? String(r[cDest]).trim() : "";
      if(!dest && cost.val == null && cli.val == null) continue;
      out.push({
        foglio: name,
        vettore: cV >= 0 && r[cV] ? String(r[cV]).trim() : name.trim(),
        doc: r[cDoc] != null ? String(r[cDoc]).trim() : "",
        data: parseDate(r[cData]),
        dataRaw: r[cData],
        dest, loc: r[cLoc] != null ? String(r[cLoc]).trim() : "",
        kg: typeof r[cKg] === "number" ? r[cKg] : parseFloat(String(r[cKg] ?? "").replace(",", ".")) || null,
        serv: r[cServ] != null ? String(r[cServ]).trim() : "",
        cliente: cli.val, costo: cost.val, costoNote: cost.note || cli.note,
        note, estero,
        tipo: cTipo >= 0 && r[cTipo] ? up(r[cTipo]).replace(/\s*\+\s*/g, " + ") : null,
        nPal: cNum >= 0 && r[cNum] ? parseInt(r[cNum], 10) || 1 : 1,
      });
    }
  }
  return out;
}

function normalize(rows){
  // anno di riferimento: il più frequente
  const years = {};
  rows.forEach((r) => { if(r.data) years[r.data.getFullYear()] = (years[r.data.getFullYear()] || 0) + 1; });
  const Y = +Object.entries(years).sort((a, b) => b[1] - a[1])[0]?.[0];
  rows.forEach((r) => {
    r.issues = [];
    if(!r.data){ r.issues.push("data mancante o non leggibile"); }
    else if(r.data.getFullYear() !== Y){
      r.issues.push(`data ${dIt(r.data)} corretta in ${Y}`);
      r.data = new Date(Y, r.data.getMonth(), r.data.getDate());
    }
    if(r.costoNote) r.issues.push(r.costoNote);
    if(r.costo == null && !r.costoNote) r.issues.push("costo mancante");
    r.entrata = /^da\s/i.test(r.dest) || up(r.note) === "F";
    r.extra = /GIACENZ|RICONSEGN|EXTRA|MANCAT|ERRAT|RITORNO/.test(up(r.note) + " " + up(r.serv));
    r.mese = r.data ? mKey(r.data) : null;
  });
  return Y;
}

/* ---------------- Calcoli ---------------- */
function sum(arr, f){ return arr.reduce((a, x) => a + (Number.isFinite(f(x)) ? f(x) : 0), 0); }
function stats(rows){
  const cli = rows.filter((r) => !r.entrata);
  const add = cli.filter((r) => r.cliente > 0 && r.costo > 0);
  const nonAdd = cli.filter((r) => !(r.cliente > 0));
  return {
    n: rows.length,
    costo: sum(rows, (r) => r.costo),
    addebitato: sum(rows, (r) => r.cliente),
    costoAdd: sum(add, (r) => r.costo),
    cliAdd: sum(add, (r) => r.cliente),
    nNonAdd: nonAdd.length,
    costoNonAdd: sum(nonAdd, (r) => r.costo),
    nEntrata: rows.filter((r) => r.entrata).length,
    costoEntrata: sum(rows.filter((r) => r.entrata), (r) => r.costo),
  };
}

function checks(rows){
  const C = [];
  const push = (tipo, r, extra = "") => C.push({ tipo, r, extra });
  rows.forEach((r) => {
    if(!r.entrata && !(r.cliente > 0) && r.costo > 0) push("Spedizione a cliente senza addebito", r);
    if(r.cliente > 0 && r.costo > 0 && r.cliente < r.costo) push("Addebitato meno del costo", r, eur2(r.cliente - r.costo));
    if(r.cliente > 0 && r.costo > 0 && r.cliente >= r.costo && r.cliente / r.costo < 1.15) push("Ricarico sotto il 15%", r, pct((r.cliente / r.costo - 1) * 100));
    if(r.extra) push("Giacenze, riconsegne e costi extra", r);
    r.issues.forEach((i) => push("Dati da sistemare nel file", r, i));
  });
  return C;
}

/* ---------------- Resa grafica ---------------- */
function kpi(label, value, delta, cls = ""){
  return `<div class="kpi ${cls}"><small>${esc(label)}</small><b>${value}</b>${delta ? `<span class="d">${delta}</span>` : ""}</div>`;
}
function deltaTxt(cur, prev, invert = false){
  if(!Number.isFinite(prev) || prev === 0) return "";
  const d = (cur / prev - 1) * 100;
  const cls = (d > 0) !== invert ? "up" : "down";
  return `<span class="${cls}">${pct(d)}</span> sul mese prima`;
}

function renderChart(){
  const months = [...new Set(ROWS.map((r) => r.mese).filter(Boolean))].sort();
  const data = months.map((m) => { const s = stats(ROWS.filter((r) => r.mese === m)); return { m, c: s.costo, a: s.addebitato }; });
  const W = Math.max(640, months.length * 90), H = 260, pad = { l: 56, r: 12, t: 16, b: 34 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.c, d.a)));
  const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const bw = (W - pad.l - pad.r) / data.length;
  let g = "";
  for(let v = 0; v <= top; v += step){
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/>`;
    g += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--steel)">${(v / 1000).toLocaleString("it-IT")}k</text>`;
  }
  const sel = $("month").value;
  data.forEach((d, i) => {
    const x = pad.l + i * bw, w = Math.min(26, bw / 3);
    const op = sel && sel !== d.m ? 0.35 : 1;
    g += `<rect x="${x + bw / 2 - w - 2}" y="${y(d.c)}" width="${w}" height="${y(0) - y(d.c)}" rx="3" fill="var(--ink)" opacity="${op}"><title>${mLabel(d.m)} costo ${eur(d.c)}</title></rect>`;
    g += `<rect x="${x + bw / 2 + 2}" y="${y(d.a)}" width="${w}" height="${y(0) - y(d.a)}" rx="3" fill="var(--red)" opacity="${op}"><title>${mLabel(d.m)} addebitato ${eur(d.a)}</title></rect>`;
    g += `<text x="${x + bw / 2}" y="${H - 12}" text-anchor="middle" font-size="12.5" fill="var(--steel)">${MESI[+d.m.split("-")[1] - 1].slice(0, 3)}</text>`;
  });
  const svg = $("chart");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = g;
}

function renderVettori(rows, prevRows){
  const names = [...new Set(rows.map((r) => r.vettore))];
  const list = names.map((v) => {
    const s = stats(rows.filter((r) => r.vettore === v));
    const p = prevRows ? stats(prevRows.filter((r) => r.vettore === v)) : null;
    return { v, s, p };
  }).sort((a, b) => b.s.costo - a.s.costo);
  const T = stats(rows);
  const ric = (s) => s.costoAdd ? pct((s.cliAdd / s.costoAdd - 1) * 100) : "—";
  $("vettTbl").innerHTML = `
    <thead><tr><th>Vettore</th><th class="n">Spedizioni</th><th class="n">Costo</th><th class="n">Costo medio</th><th class="n">Addebitato</th><th class="n">Ricarico</th><th class="n">A clienti senza addebito</th>${prevRows ? `<th class="n">Costo vs mese prima</th>` : ""}</tr></thead>
    <tbody>${list.map(({ v, s, p }) => `<tr>
      <td><b>${esc(v)}</b></td><td class="n">${s.n}</td><td class="n">${eur(s.costo)}</td><td class="n">${eur(s.costo / s.n)}</td>
      <td class="n">${eur(s.addebitato)}</td><td class="n">${ric(s)}</td>
      <td class="n">${s.nNonAdd ? `${s.nNonAdd} · ${eur(s.costoNonAdd)}` : "—"}</td>
      ${prevRows ? `<td class="n">${p && p.costo ? pct((s.costo / p.costo - 1) * 100) : "nuovo"}</td>` : ""}
    </tr>`).join("")}</tbody>
    <tfoot><tr><td>Totale</td><td class="n">${T.n}</td><td class="n">${eur(T.costo)}</td><td class="n">${eur(T.costo / T.n)}</td><td class="n">${eur(T.addebitato)}</td><td class="n">${ric(T)}</td><td class="n">${T.nNonAdd} · ${eur(T.costoNonAdd)}</td>${prevRows ? "<td></td>" : ""}</tr></tfoot>`;
  $("vettSub").textContent = `Il ricarico è calcolato solo sulle spedizioni addebitate al cliente. Le spedizioni in entrata o per conto dei fornitori (${T.nEntrata}, ${eur(T.costoEntrata)}) sono nel costo ma non tra quelle da addebitare.`;
}

let CHECKS = [];
function renderChecks(rows){
  CHECKS = checks(rows);
  const groups = {};
  CHECKS.forEach((c) => (groups[c.tipo] ||= []).push(c));
  const order = ["Addebitato meno del costo", "Spedizione a cliente senza addebito", "Giacenze, riconsegne e costi extra", "Ricarico sotto il 15%", "Dati da sistemare nel file"];
  const html = order.filter((k) => groups[k]).map((k) => {
    const g = groups[k];
    const tot = sum(g, (c) => c.r.costo);
    const cls = k.startsWith("Addebitato") ? "bad" : k.startsWith("Dati") ? "" : "warn";
    return `<details class="chk" ${k.startsWith("Addebitato") ? "open" : ""}>
      <summary><span>${esc(k)}</span><span><span class="pill ${cls}">${g.length}</span> ${k.startsWith("Dati") ? "" : `<span class="pill">${eur(tot)}</span>`}</span></summary>
      <div class="wrap"><table class="tbl">
        <thead><tr><th>Vettore</th><th>Documento</th><th>Data</th><th>Destinatario</th><th>Località</th><th class="n">Costo</th><th class="n">Addebitato</th><th>Dettaglio</th></tr></thead>
        <tbody>${g.map(({ r, extra }) => `<tr><td>${esc(r.vettore)}</td><td>${esc(r.doc)}</td><td>${dIt(r.data)}</td><td>${esc(r.dest)}</td><td>${esc(r.loc)}</td>
          <td class="n">${eur2(r.costo)}</td><td class="n">${r.cliente > 0 ? eur2(r.cliente) : "—"}</td><td>${esc([extra, r.note && !extra.includes(r.note) ? r.note : ""].filter(Boolean).join(" · "))}</td></tr>`).join("")}</tbody>
      </table></div></details>`;
  }).join("");
  $("checks").innerHTML = html || `<p class="empty-note">Nessuna spedizione da controllare in questo periodo.</p>`;
}

/* Confronto fatture/tariffe pallet. Le tariffe pubblicate sono prezzi finali:
   il divisore per risalire al costo lo inserisce l'utente e resta solo su questo dispositivo. */
const DIV_KEY = "pit_an_divisore";
function renderListino(rows){
  const box = $("listino");
  const typed = rows.filter((r) => r.tipo && r.costo > 0);
  if(!REF.pallet){ box.innerHTML = `<p class="empty-note">Tariffe pallet non disponibili senza connessione.</p>`; return; }
  if(!typed.length){
    box.innerHTML = `<p class="sub">Qui puoi vedere di quanto le fatture del vettore pallet si scostano dalle tariffe, mese per mese, compresi i supplementi carburante.</p>
      <p>Per attivarlo, nel foglio del vettore aggiungi una colonna <b>TIPO PALLET</b> (MINI, QUARTER, HALF, MEDIUM, LIGHT, LARGE, FULL, BIG, MEGA, anche con le varianti come “MEDIUM + 10%”) e, se in una spedizione ce n'è più di uno, una colonna <b>N. PALLET</b>. La località deve contenere la sigla della provincia tra parentesi: “Cosenza (CS)”.</p>`;
    return;
  }
  let div = 1;
  try{ div = parseFloat(localStorage.getItem(DIV_KEY)) || 1; }catch{}
  const prov2reg = {};
  REF.geo.forEach((g) => g.province.forEach((p) => { prov2reg[p.sigla] = g.id; }));
  const res = typed.map((r) => {
    const sig = (/\(([A-Z]{2})\)/.exec(r.loc) || [])[1];
    const base = REF.pallet.tariffe[prov2reg[sig]]?.[r.tipo];
    const listino = base ? base / div * r.nPal : null;
    return listino ? { r, listino, scost: (r.costo / listino - 1) * 100 } : { r, listino: null };
  });
  const ok = res.filter((x) => x.listino);
  const avg = ok.length ? (sum(ok, (x) => x.r.costo) / sum(ok, (x) => x.listino) - 1) * 100 : NaN;
  box.innerHTML = `
    <label class="field-label" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 12px">
      Divisore per risalire al costo dalle tariffe pubblicate
      <input id="divisore" class="input" type="number" step="0.01" min="1" value="${div}" style="width:110px;min-height:40px">
    </label>
    <p class="sub">${ok.length} fatture confrontate con le tariffe pallet${res.length > ok.length ? `, ${res.length - ok.length} senza provincia o tipo riconoscibile` : ""}. Scostamento medio: <b>${pct(avg, 1)}</b>. Il divisore resta salvato solo su questo dispositivo.</p>
    <div class="wrap"><table class="tbl"><thead><tr><th>Vettore</th><th>Documento</th><th>Data</th><th>Località</th><th>Pallet</th><th class="n">Tariffa</th><th class="n">Fattura</th><th class="n">Scostamento</th></tr></thead>
    <tbody>${ok.map(({ r, listino, scost }) => `<tr><td>${esc(r.vettore)}</td><td>${esc(r.doc)}</td><td>${dIt(r.data)}</td><td>${esc(r.loc)}</td><td>${r.nPal > 1 ? r.nPal + " × " : ""}${esc(r.tipo)}</td><td class="n">${eur2(listino)}</td><td class="n">${eur2(r.costo)}</td><td class="n">${pct(scost, 1)}</td></tr>`).join("")}</tbody></table></div>`;
  $("divisore").addEventListener("change", (e) => {
    const v = parseFloat(String(e.target.value).replace(",", "."));
    try{ v >= 1 ? localStorage.setItem(DIV_KEY, String(v)) : localStorage.removeItem(DIV_KEY); }catch{}
    renderListino(rows);
  });
}

function render(){
  const sel = $("month").value;
  const rows = sel ? ROWS.filter((r) => r.mese === sel) : ROWS;
  const months = [...new Set(ROWS.map((r) => r.mese).filter(Boolean))].sort();
  const prevKey = sel ? months[months.indexOf(sel) - 1] : null;
  const prevRows = prevKey ? ROWS.filter((r) => r.mese === prevKey) : null;
  const s = stats(rows), p = prevRows ? stats(prevRows) : null;
  const rec = s.costo ? s.addebitato / s.costo * 100 : NaN;
  const ric = s.costoAdd ? (s.cliAdd / s.costoAdd - 1) * 100 : NaN;
  $("kpis").innerHTML =
    kpi("Costo trasporti", eur(s.costo), p ? deltaTxt(s.costo, p.costo) : `${s.n} spedizioni`) +
    kpi("Addebitato ai clienti", eur(s.addebitato), p ? deltaTxt(s.addebitato, p.addebitato, true) : "") +
    kpi("Quota del costo recuperata", Number.isFinite(rec) ? `${Math.round(rec)}%` : "—", "addebitato ÷ costo totale") +
    kpi("Ricarico medio", pct(ric), "sulle spedizioni addebitate") +
    kpi("A clienti senza addebito", eur(s.costoNonAdd), `${s.nNonAdd} spedizioni da verificare`, s.nNonAdd ? "warn" : "") +
    kpi("Spedizioni", String(s.n), p ? `${p.n} il mese prima` : "");
  renderChart();
  renderVettori(rows, prevRows);
  renderChecks(rows);
  renderListino(rows);
}

/* ---------------- Esportazione ---------------- */
function exportCsv(){
  const head = ["Controllo", "Vettore", "Documento", "Data", "Destinatario", "Località", "Costo", "Addebitato", "Dettaglio", "Note"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const num = (v) => Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "";
  const lines = [head.map(q).join(";")].concat(CHECKS.map(({ tipo, r, extra }) =>
    [tipo, r.vettore, r.doc, dIt(r.data), r.dest, r.loc, num(r.costo), num(r.cliente), extra, r.note].map((v, i) => i === 6 || i === 7 ? v : q(v)).join(";")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `controlli-trasporti-${$("month").value || "periodo"}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- Avvio ---------------- */
async function load(file){
  $("dropTitle").textContent = `Lettura di ${file.name}…`;
  try{
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    ROWS = readWorkbook(wb);
    if(!ROWS.length) throw new Error("vuoto");
    normalize(ROWS);
  }catch{
    $("dropTitle").textContent = "Il file non sembra quello delle spese di trasporto";
    $("dropSub").textContent = "Servono fogli con le colonne DATA, CLIENTE e il costo. Riprova con un altro file.";
    return;
  }
  const months = [...new Set(ROWS.map((r) => r.mese).filter(Boolean))].sort();
  $("month").innerHTML = months.slice().reverse().map((m) => `<option value="${m}">${mLabel(m)}</option>`).join("") + `<option value="">Tutto il periodo</option>`;
  // di default l'ultimo mese chiuso, se quello in corso è appena iniziato
  $("month").value = months[months.length - 1];
  $("dropTitle").textContent = file.name;
  $("dropSub").textContent = `${ROWS.length} spedizioni lette da ${new Set(ROWS.map((r) => r.foglio)).size} fogli. Clicca per caricare un altro file.`;
  $("out").hidden = false;
  render();
}

function setup(){
  const drop = $("drop"), inp = $("file");
  inp.addEventListener("change", () => inp.files[0] && load(inp.files[0]));
  ["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (ev) => { const f = ev.dataTransfer.files[0]; if(f) load(f); });
  $("month").addEventListener("change", render);
  $("btnPrint").addEventListener("click", () => { document.querySelectorAll("details.chk").forEach((d) => d.open = true); window.print(); });
  $("btnCsv").addEventListener("click", exportCsv);
  Promise.all(["../data/trasporti/pallet.json", "../data/trasporti/geo.json"].map((u) => fetch(u).then((r) => r.json())))
    .then(([p, g]) => { REF.pallet = p; REF.geo = g; if(ROWS.length) render(); })
    .catch(() => {});
}
setup();
