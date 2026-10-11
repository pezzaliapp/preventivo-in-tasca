/*
 * PDF A4 del preventivo con jsPDF (lib/jspdf.umd.min.js, licenza MIT), per "Invia PDF":
 * non dipende dalla stampa del telefono. Disegna il modello di js/core/documento.js,
 * con la stessa impaginazione della stampa. jsPDF si carica solo quando serve.
 */
let libreria = null;
/** Carica jsPDF una volta sola (è nella copia offline). */
export function caricaJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  if (!libreria) {
    libreria = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/jspdf.umd.min.js';
      s.onload = () => window.jspdf ? resolve(window.jspdf.jsPDF) : reject(new Error('PDF non disponibile'));
      s.onerror = () => reject(new Error('PDF non disponibile: riapri l\'app con la connessione'));
      document.head.appendChild(s);
    });
    libreria.catch(() => { libreria = null; });
  }
  return libreria;
}

/*
 * I caratteri standard del PDF (Helvetica) coprono la codifica WinAnsi: lettere accentate,
 * €, •, –, —, ’ sì; il segno meno (−) e gli spazi stretti degli importi no.
 */
const PDF_TESTO = s => String(s == null ? '' : s)
  .replace(/[−‐‑]/g, '-').replace(/[    ]/g, ' ')
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');

const MM = { pagina: [210, 297], margine: 15, basso: 18 };
const NERO = 0, GRIGIO = 85, LINEA = 187;

/** Crea il PDF del modello e restituisce un Blob application/pdf. */
export async function creaPdf(m) {
  const jsPDF = await caricaJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: m.titolo, creator: m.piede });
  const L = MM.margine, R = MM.pagina[0] - MM.margine, W = R - L, FONDO = MM.pagina[1] - MM.basso;
  let y = MM.margine;
  const pt = n => n * 0.3528; // punti tipografici → mm
  const font = (size, stile = 'normal', grigio = NERO) => { doc.setFont('helvetica', stile); doc.setFontSize(size); doc.setTextColor(grigio); };
  const righe = (testo, larghezza) => doc.splitTextToSize(PDF_TESTO(testo), larghezza);
  const alto = (n, size, inter = 1.3) => n * pt(size) * inter;
  const scrivi = (testo, x, yy, opz) => doc.text(testo, x, yy, Object.assign({ baseline: 'top' }, opz));
  const nuovaPagina = () => { doc.addPage(); y = MM.margine; };
  const spazio = h => { if (y + h > FONDO) { nuovaPagina(); return true; } return false; };
  const linea = (y0, spessore = 0.2, grigio = LINEA, x0 = L, x1 = R) => { doc.setDrawColor(grigio); doc.setLineWidth(spessore); doc.line(x0, y0, x1, y0); };

  /* Testata: azienda a sinistra, titolo, data e validità a destra */
  font(22, 'bold'); const tit = righe(m.titolo, W * 0.5);
  font(10); const az = m.azienda.flatMap(r => righe(r, W * 0.5));
  const hDestra = alto(tit.length, 22, 1.1) + 1.5 + alto(2, 10);
  font(10); scrivi(az, L, y, { lineHeightFactor: 1.35 });
  font(22, 'bold'); scrivi(tit, R, y, { align: 'right', lineHeightFactor: 1.1 });
  font(10); scrivi([PDF_TESTO(m.data), PDF_TESTO(m.valido)], R, y + alto(tit.length, 22, 1.1) + 1.5, { align: 'right' });
  y += Math.max(hDestra, alto(az.length, 10, 1.35)) + 3.5;
  linea(y, 1.05, NERO); y += 5;

  /* Cliente */
  if (m.cliente) {
    font(9, 'normal', GRIGIO); scrivi('Cliente', L, y); y += alto(1, 9);
    if (m.cliente.nome) { font(11, 'bold'); const r = righe(m.cliente.nome, W); scrivi(r, L, y); y += alto(r.length, 11); }
    if (m.cliente.riferimento) { font(11); const r = righe(m.cliente.riferimento, W); scrivi(r, L, y); y += alto(r.length, 11); }
    y += 4;
  }

  /* Tabella delle righe (l'intestazione si ripete sulle pagine nuove) */
  const col = [];
  if (m.conImg) col.push({ k: 'img', w: 34 });
  col.push({ k: 'codice', t: 'Codice', w: 24 }, { k: 'descrizione', t: 'Descrizione', w: 0 },
    { k: 'qta', t: 'Q.tà', w: 11, r: true }, { k: 'listino', t: 'Listino', w: 25, r: true },
    { k: 'sconto', t: 'Sconto', w: 16, r: true }, { k: 'netto', t: 'Netto', w: 25, r: true });
  col.find(c => c.k === 'descrizione').w = W - col.reduce((a, c) => a + c.w, 0);
  let x = L; for (const c of col) { c.x = x; x += c.w; }
  const PAD = 1.4;
  const testata = () => {
    font(9, 'bold');
    for (const c of col) if (c.t) scrivi(PDF_TESTO(c.t), c.r ? c.x + c.w - PAD : c.x + PAD, y + 1.6, c.r ? { align: 'right' } : undefined);
    y += alto(1, 9) + 3.2; linea(y, 0.53, NERO);
  };
  testata();
  for (const r of m.righe) {
    font(10); const desc = [];
    r.descrizione.forEach((d, i) => { font(i ? 8.5 : 10); righe(d, col.find(c => c.k === 'descrizione').w - 2 * PAD).forEach(t => desc.push({ t, size: i ? 8.5 : 10 })); });
    font(10); const cod = righe(r.codice, col.find(c => c.k === 'codice').w - 2 * PAD);
    let hImg = 0, img = null;
    if (r.img) { try { const pr = doc.getImageProperties(r.img); const k = Math.min(32 / pr.width, 30 / pr.height); img = { w: pr.width * k, h: pr.height * k, tipo: pr.fileType }; hImg = img.h; } catch (e) { img = null; } }
    const hTesto = desc.reduce((a, d) => a + alto(1, d.size), 0);
    const h = Math.max(hTesto, alto(cod.length, 10), hImg) + 4.2;
    if (spazio(h)) testata();
    const yt = y + 2.1;
    if (img) doc.addImage(r.img, img.tipo, col[0].x, yt, img.w, img.h);
    const c = k => col.find(cc => cc.k === k);
    font(10); scrivi(cod, c('codice').x + PAD, yt);
    let yd = yt; for (const d of desc) { font(d.size); scrivi(d.t, c('descrizione').x + PAD, yd); yd += alto(1, d.size); }
    font(10);
    for (const k of ['qta', 'listino', 'sconto', 'netto']) scrivi(PDF_TESTO(r[k]), c(k).x + c(k).w - PAD, yt, { align: 'right' });
    y += h; linea(y, 0.18);
  }

  /* Totali, a destra sul 60% della pagina */
  y += 5;
  const tx = L + W * 0.4;
  for (const t of m.totali) {
    const size = t.forte ? 13 : 11, h = alto(1, size) + 2.8;
    spazio(h + (t.forte ? 1 : 0));
    if (t.forte) { linea(y, 0.53, NERO, tx, R); }
    font(size, t.forte ? 'bold' : 'normal');
    scrivi(PDF_TESTO(t.etichetta), tx, y + 1.4); scrivi(PDF_TESTO(t.valore), R, y + 1.4, { align: 'right' });
    y += h;
  }

  /* Riquadro "Oppure a noleggio operativo": non si spezza tra due pagine se ci sta in una */
  if (m.noleggio) {
    const n = m.noleggio, P = 4, IW = W - 2 * P;
    // prima si misurano le altezze, poi si disegna: così il riquadro sa se sta in una pagina
    const istruzioni = [];
    font(14, 'bold'); const rt = righe(n.titolo, IW); istruzioni.push({ h: alto(rt.length, 14, 1.15) + 2, f: (yy) => { font(14, 'bold'); scrivi(rt, L + P, yy, { lineHeightFactor: 1.15 }); } });
    if (n.validita) { font(10, 'bold'); const tw = doc.getTextWidth(PDF_TESTO(n.validita)); istruzioni.push({ h: alto(1, 10) + 5, f: yy => { doc.setDrawColor(NERO); doc.setLineWidth(0.7); doc.roundedRect(L + P, yy, tw + 6, alto(1, 10) + 2.6, 1.5, 1.5); font(10, 'bold'); scrivi(PDF_TESTO(n.validita), L + P + 3, yy + 1.3); } }); }
    font(10); const rb = righe(n.base, IW); istruzioni.push({ h: alto(rb.length, 10) + 2, f: yy => { font(10); scrivi(rb, L + P, yy); } });
    const TW = IW * 0.7;
    istruzioni.push({ h: alto(1, 9) + 3.6, f: yy => { font(9, 'bold'); scrivi(PDF_TESTO(n.intestazione[0]), L + P + PAD, yy + 1.4); scrivi(PDF_TESTO(n.intestazione[1]), L + P + TW - PAD, yy + 1.4, { align: 'right' }); linea(yy + alto(1, 9) + 3.2, 0.53, NERO, L + P, L + P + TW); } });
    for (const [durata, rata] of n.rate) istruzioni.push({ h: alto(1, 10) + 3.6, f: yy => { font(10); scrivi(PDF_TESTO(durata), L + P + PAD, yy + 1.8); font(10, 'bold'); scrivi(PDF_TESTO(rata), L + P + TW - PAD, yy + 1.8, { align: 'right' }); linea(yy + alto(1, 10) + 3.6, 0.18, LINEA, L + P, L + P + TW); } });
    istruzioni.push({ h: 2.5, f: () => {} });
    for (const t of n.note) { font(9); const r = righe(t, IW - 4); istruzioni.push({ h: alto(r.length, 9) + 0.6, f: yy => { font(9); scrivi('•', L + P, yy); scrivi(r, L + P + 4, yy); } }); }
    if (n.benefici) {
      const BW = (IW - 6) / 2;
      const colonne = n.benefici.map(b => { font(9.5, 'bold'); const tt = righe(b.titolo, BW); font(8.5); const pp = b.testi.map(t => righe(t, BW)); return { tt, pp, h: alto(tt.length, 9.5) + 0.6 + pp.reduce((a, r) => a + alto(r.length, 8.5) + 0.7, 0) }; });
      istruzioni.push({ h: Math.max(...colonne.map(c => c.h)) + 3, f: yy => colonne.forEach((c, i) => {
        const bx = L + P + i * (BW + 6); let by = yy + 2.5;
        font(9.5, 'bold'); scrivi(c.tt, bx, by); by += alto(c.tt.length, 9.5) + 0.6;
        font(8.5); for (const r of c.pp) { scrivi(r, bx, by); by += alto(r.length, 8.5) + 0.7; }
      }) });
    }
    font(8.5, 'normal', 51); const rs = righe(n.simulazione, IW); istruzioni.push({ h: alto(rs.length, 8.5) + 2.5, f: yy => { font(8.5, 'normal', 51); scrivi(rs, L + P, yy + 2.5); } });
    const hTot = istruzioni.reduce((a, i) => a + i.h, 0) + 2 * P;
    y += 7;
    if (y + hTot > FONDO && hTot <= FONDO - MM.margine) nuovaPagina();
    // se il riquadro è più alto di una pagina, si disegna a pezzi senza bordo
    const conBordo = y + hTot <= FONDO;
    const y0 = y; y += P;
    for (const i of istruzioni) { if (!conBordo) spazio(i.h); i.f(y); y += i.h; }
    y += P;
    if (conBordo) { doc.setDrawColor(NERO); doc.setLineWidth(0.53); doc.rect(L, y0, W, y - y0); }
  }

  /* Note per il cliente, firma e piè di pagina */
  if (m.note.length) {
    y += 6; font(9.5, 'normal', 51);
    for (const r of m.note.flatMap(t => righe(t, W))) { spazio(alto(1, 9.5)); scrivi(r, L, y); y += alto(1, 9.5); }
  }
  if (m.firma.length) {
    y += 8; font(10);
    for (const r of m.firma.flatMap(t => righe(t, W))) { spazio(alto(1, 10)); scrivi(r, L, y); y += alto(1, 10); }
  }
  y += 8; spazio(alto(1, 8)); font(8, 'normal', GRIGIO); scrivi(PDF_TESTO(m.piede), L, y);
  // numero di pagina solo se le pagine sono più di una
  const n = doc.getNumberOfPages();
  if (n > 1) for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, 'normal', GRIGIO); scrivi(`Pagina ${i} di ${n}`, R, MM.pagina[1] - 10, { align: 'right' }); }
  return doc.output('blob');
}

