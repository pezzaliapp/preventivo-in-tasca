/*
 * Listino SINTETICO per provare il parser senza il PDF vero.
 * Codici, nomi e prezzi sono inventati. Riproduce l'impaginazione che il parser
 * si aspetta: indice, titoli grandi, sottotitoli, elenchi puntati, tabelle con
 * codice a 8 cifre e prezzo, varianti senza prezzo, prezzi orfani, descrizioni
 * su due righe, ombre duplicate e testo ruotato.
 * Restituisce un oggetto con la stessa forma di un documento pdf.js.
 */
const H = 842, W = 595;

// Voce di testo: y misurata dall'alto della pagina, come la vede il lettore.
function t(str, x, y, size = 10, extra = {}) {
  const rot = extra.rotated ? 1 : 0;
  return { str, transform: [size, rot, 0, size, x, H - y], width: extra.w != null ? extra.w : str.length * size * 0.5 };
}
// Riga di tabella: codice, descrizione, alimentazione facoltativa, prezzo.
function riga(y, code, desc, price, power) {
  const out = [t(code, 60, y, 9, { w: 40 })];
  if (desc) out.push(t(desc, 120, y, 9));
  if (power) out.push(t(power, 330, y, 9));
  if (price) out.push(t(price, 480, y, 9, { w: 50 }));
  return out;
}
function intestazioneTabella(y) { return [t('CODICE', 60, y, 8), t('DESCRIZIONE', 120, y, 8), t('PREZZO', 480, y, 8)]; }
function punti(y, testi) { return testi.flatMap((s, i) => [t('•', 60, y + i * 14, 9, { w: 4 }), t(s, 72, y + i * 14, 9)]); }

export const PAGINE = [
  // 1 — copertina
  [t('LISTINO PREZZI', 60, 120, 28), t('04/2026', 300, 120, 28), t('Attrezzature per officina', 60, 160, 14), t('Prezzi IVA esclusa', 60, 800, 8)],
  // 2 — indice
  [
    t('INDICE', 60, 60, 18),
    t('EQUILIBRATRICI ........ 3', 60, 100), t('Equilibratrici auto ........ 3', 80, 114), t('Equilibratrici moto ........ 4', 80, 128),
    t('SMONTAGOMME ........ 5', 60, 150), t('Smontagomme per camion ........ 6', 80, 164),
    t('SOLLEVATORI ........ 7', 60, 186), t('Sollevatori a 2 colonne ........ 7', 80, 200), t('Accessori sollevatori ........ 8', 80, 214),
    t('ASSETTO RUOTE ........ 9', 60, 236), t('Altre attrezzature ... 10', 80, 250)
  ],
  // 3 — equilibratrice auto
  [
    t('MEC 1000', 60, 60, 24, { w: 110 }),
    t('Equilibratrice per auto con sonar e laser', 60, 100, 12),
    ...punti(200, ['Bloccaggio rapido NLS della ruota', 'Monitor touch da 22"', 'Freno a pedale e protezione ruota']),
    t('con acquisizione dati automatica', 72, 242, 9),
    t('ACCESSORI OPTIONAL a pag. 8', 60, 400, 10),
    ...intestazioneTabella(480),
    ...riga(500, '01100313', 'MEC 1000 versione base', '9.500,00 €', '1ph 230V 50Hz'),
    ...riga(500, '01100313', 'MEC 1000 versione base', null), // ombra duplicata di InDesign
    ...riga(522, '01100314', 'MEC 1000 con sollevatore ruote LIFT', '10.200,00 €', '3ph 400V 50Hz'),
    ...riga(540, '01100315', 'MEC 1000 NLS', null),
    ...riga(570, '01100316', 'MEC 1000 RLC con analisi', '12.000,00 €'),
    t('pneumatico e laser', 120, 582, 9),
    t('S', 300, 570, 9, { w: 5 }),
    t('Nota ruotata', 20, 600, 9, { rotated: true })
  ],
  // 4 — equilibratrice moto
  [
    t('MOTO 50', 60, 60, 22, { w: 90 }),
    t('Equilibratrice per moto e scooter', 60, 100, 12),
    ...intestazioneTabella(480),
    ...riga(500, '01200001', 'Moto 50 manuale', '3.200,00 €', '230V 50Hz'),
    t('01200002 KIT', 60, 522, 9, { w: 52 }), t('adattatori moto', 125, 522, 9), t('3.450,00 €', 480, 522, 9, { w: 50 })
  ],
  // 5 — smontagomme auto
  [
    t('F 536S', 60, 60, 22, { w: 70 }),
    t('Smontagomme leverless con motoinverter MI', 60, 100, 12),
    ...intestazioneTabella(480),
    ...riga(500, '02100100', 'F 536S MI 2 velocità', '7.800,00 €', '1ph 230V 50/60Hz'),
    ...riga(522, '02100101', 'F 536S GT racing con premitallone', '8.900,00 €', '3ph 400V 50Hz'),
    ...riga(544, '02100102', 'F 536S', '6.100,00 €', '1ph')
  ],
  // 6 — smontagomme camion
  [
    t('TRUCK 26', 60, 60, 22, { w: 95 }),
    t('Smontagomme per camion e autobus', 60, 100, 12),
    ...intestazioneTabella(480),
    ...riga(500, '02200200', 'Truck 26 a batteria', '21.500,00 €', '24V'),
    ...riga(522, '02200201', 'Truck 26 elettrico', '19.900,00 €', '3ph 400V 50Hz')
  ],
  // 7 — sollevatori a 2 colonne
  [
    t('PFA 40', 60, 60, 22, { w: 70 }),
    t('Sollevatore a due colonne portata 4.000 kg', 60, 100, 12),
    ...intestazioneTabella(480),
    ...riga(500, '03100040', 'PFA 40 elettroidraulico', '6.000,00 €', '3ph 400V 50Hz'),
    ...riga(522, '03100041', 'PFA 40 versione monofase', '6.250,00 €', '1ph 230V 50Hz')
  ],
  // 8 — accessori (prezzi senza €, prezzo orfano, varianti, continuazione minuscola)
  [
    t('ACCESSORI', 60, 60, 20, { w: 100 }),
    ...intestazioneTabella(120),
    ...riga(140, '25100040', 'Flangia universale', '65,00'),
    ...riga(160, '25100041', 'Cono piccolo per', '120,00'),
    ...riga(178, '25100042', 'cerchi in alluminio. Set di 4 pezzi.', '120,00'),
    ...riga(200, '25100044', null, null),
    t('Kit di cablaggio', 120, 212, 9), t('350,00', 480, 212, 9, { w: 30 }),
    ...riga(224, '25100045', null, null),
    ...riga(260, '25100046', 'Adattatore', '1.250,00'),
    ...riga(278, '25100047', null, null),
    ...riga(320, '25100050', 'Tamponi in gomma', '45,00')
  ],
  // 9 — assetto ruote e regole commerciali
  [
    t('GEO 10', 60, 60, 22, { w: 70 }),
    t('Assetto ruote 3D per vetture', 60, 100, 12),
    ...intestazioneTabella(480),
    ...riga(500, '04100010', 'GEO 10 completo', '15.400,00 €'),
    ...riga(522, '04100011', 'WR 328A configurazione camion', '24.000,00 €'),
    ...riga(544, '25100050', 'Tamponi in gomma', '45,00')
  ],
  // 10 — senza titolo grande: il nome viene dalla sezione
  [
    ...intestazioneTabella(480),
    ...riga(500, '05100001', 'Compressore 100 litri', '890,00 €', '230V 50Hz'),
    ...riga(522, '05100002', 'WL 85 MOVE colonne mobili', '32.000,00 €'),
    ...riga(544, '05100003', '', '75,00 €')
  ]
];

/** Documento finto con l'interfaccia di pdf.js usata dal parser. */
export function pdfSintetico(pagine = PAGINE) {
  return {
    numPages: pagine.length,
    async getPage(n) {
      const items = pagine[n - 1];
      return {
        getViewport: ({ scale }) => ({ width: W * scale, height: H * scale }),
        getTextContent: async () => ({ items: items.map(i => ({ str: i.str, transform: i.transform.slice(), width: i.width })) }),
        cleanup() {}
      };
    },
    destroy() {}
  };
}
