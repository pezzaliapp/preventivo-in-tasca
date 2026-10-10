/*
 * Book dell'agente SINTETICO, solo per i test. Ha la stessa struttura del book vero
 * (che è cifrato e non entra mai nei test) e usa i codici del listino sintetico.
 * Tutti i testi, i prezzi e le regole sono inventati.
 */
export const BOOK = {
  source: 'Book sintetico di prova',
  names: { '05100003': 'Kit cablaggio speciale' },
  vehicles: { byCode: { '04100011': ['camion', '(auto)'], '01200001': ['moto'], '02200201': ['pullman', 'agricoli'] } },
  notes: [
    { codes: ['01100313', '01100314'], title: 'MEC 1000', fa: 'Equilibra ruote auto fino a 30 pollici.', nonFa: 'Non è adatta ai camion.', aChi: 'Gommisti con 5–20 ruote al giorno.', frase: 'Si ripaga in un anno.' },
    { codes: ['03100040'], title: 'PFA 40', fa: 'Solleva fino a 4.000 kg.', nonFa: '', aChi: 'Officine generiche.', frase: '' }
  ],
  rules: [
    { kind: 'must', when: ['01100313', '01100314'], need: ['25100040'], msg: 'Con la MEC 1000 serve la flangia universale.' },
    { kind: 'tip', whenSub: '^Sollevatori', need: ['25100046', '25100047'], any: true, msg: 'Proponi un adattatore per il sollevatore.' },
    { kind: 'tip', whenActivity: 'smontaggio', exceptCodes: ['02100102'], need: ['25100050'], msg: 'Con lo smontagomme proponi i tamponi.' },
    { kind: 'info', when: ['04100010'], msg: 'GEO 10: serve un ponte a quattro colonne.' },
    { kind: 'info', nameMatch: 'Truck', msg: 'Truck: verifica la pressione dell\'aria in officina.' }
  ],
  transport: {
    includedCodes: {
      '04100010': 'Trasporto incluso per GEO 10',
      '03100040': { text: 'Trasporto incluso per PFA 40', minNet: 5000, belowMsg: 'Sotto {min} il trasporto della PFA 40 non è incluso (netto {net}).', fixLabel: 'Porta il netto a {min}', okMsg: 'Trasporto PFA 40 incluso: netto {net}, minimo {min}.' }
    },
    includedPack: { codes: ['01100313', '02100100'], text: 'Trasporto incluso per il pacchetto MEC 1000 + F 536S', alsoCovers: ['25100040'] },
    labels: { quote: 'Trasporto da quotare', install: 'Installazione da quotare a parte', incl: 'Trasporto incluso' },
    tipOther: 'Per le altre macchine aggiungi il trasporto.',
    tipQuote: 'Aggiungi il trasporto al preventivo.',
    tipInstall: 'Aggiungi l\'installazione al preventivo.',
    warranty: 'Garanzia 24 mesi con installazione certificata.',
    warrantyNote: 'Garanzia 24 mesi.'
  },
  pricing: {
    packBase: { codes: ['01100313', '02100100'], net: 15000, total: 16000, b300: '02200201', msgOk: 'Pacchetto a {exp}{tot}.', msgWrong: 'Pacchetto: netto {net}, concordato {exp}.', fixLabel: 'Imposta il pacchetto a {exp}', totText: ' (con Truck 26: {total})' },
    b300: { code: '02200201', withCodes: ['01100313', '02100100'], netWith: 15000, netAlone: 17000, transport: 350, transportLabel: 'Trasporto Truck 26', ctxWith: 'con il pacchetto', ctxAlone: 'da solo', msgOk: 'Truck 26 {ctx} a {exp}.', msgWrong: 'Truck 26 {ctx}: netto {net}, concordato {exp}.', fixLabel: 'Imposta {exp}', transportMsg: 'Manca il trasporto della Truck 26 ({price}).', transportAdd: 'Aggiungi trasporto {price}' }
  },
  manual: { '99999999': { name: 'Kit fuori listino', note: 'Non è nel listino: chiedi il prezzo.' } },
  postazioni: [
    { id: 'auto-base', vehicle: 'auto', fascia: 'Base', title: 'Postazione base', subtitle: 'Per iniziare', power: 'choose', transport: 'quote', netNote: '',
      items: [{ code: '01100313', label: 'Equilibratrice', alt: { tri: '01100314' } }, { code: '02100102', label: 'Smontagomme' }],
      optional: [{ code: '25100040', label: 'Flangia' }, { code: '99999999', label: 'Kit fuori listino' }],
      when: 'Officina piccola.', say: 'Parti da qui.', watch: 'Controlla la corrente.' },
    { id: 'auto-media-a', vehicle: 'auto', fascia: 'Media', title: 'Postazione media A', subtitle: 'Trifase', power: 'tri', transport: 'incl', netNote: 'Prezzo netto concordato.', applyPricing: true,
      items: [{ code: '01100313', label: 'Equilibratrice' }, { code: '02100100', label: 'Smontagomme MI' }], optional: [],
      when: 'Officina media.', say: 'Pacchetto completo.', watch: 'Serve trifase.' },
    { id: 'auto-media-b', vehicle: 'auto', fascia: 'Media', title: 'Postazione media B', subtitle: 'Monofase', power: 'mono', transport: 'quote', netNote: '',
      items: [{ code: '01100313', label: 'Equilibratrice' }, { code: '02100102', label: 'Smontagomme' }], optional: [],
      when: 'Officina media monofase.', say: '', watch: '' },
    { id: 'auto-alta-puma', vehicle: 'auto', fascia: 'Alta', title: 'Postazione alta Puma', subtitle: '', power: 'tri', transport: 'quote', netNote: '',
      items: [{ code: '01100316', label: 'Equilibratrice RLC' }, { code: '02100101', label: 'Smontagomme GT' }], optional: [], when: '', say: '', watch: '' },
    { id: 'auto-alta-cm', vehicle: 'auto', fascia: 'Alta', title: 'Postazione alta CM', subtitle: '', power: 'tri', transport: 'quote', netNote: '',
      items: [{ code: '01100316', label: 'Equilibratrice RLC' }, { code: '03100040', label: 'Sollevatore' }], optional: [], when: '', say: '', watch: '' },
    { id: 'truck-base', vehicle: 'truck', fascia: 'Base', title: 'Postazione camion', subtitle: '', power: 'tri', transport: 'quote', netNote: '',
      items: [{ code: '02200201', label: 'Smontagomme camion' }], optional: [], when: '', say: '', watch: '' }
  ],
  wizard: {
    auto: {
      title: 'Quale postazione serve?',
      questions: [
        { id: 'mestiere', q: 'Che lavoro fa?', options: [{ v: 'gommista', label: 'Gommista' }, { v: 'servizio', label: 'Servizio rapido' }] },
        { id: 'ruote', q: 'Che ruote?', hint: 'Diametro tipico', options: [{ v: 'low', label: 'Fino a 18"' }, { v: 'high', label: 'Oltre 18"' }] },
        { id: 'ribassati', q: 'Ribassati?', options: [{ v: 'si', label: 'Sì' }, { v: 'no', label: 'No' }] },
        { id: 'corrente', q: 'Corrente?', options: [{ v: 'tri', label: 'Trifase' }, { v: 'mono', label: 'Monofase' }] },
        { id: 'alta', q: 'Quale marca?', showIf: 'alta', options: [{ v: 'puma', label: 'Puma' }, { v: 'cm', label: 'CM' }] }
      ],
      fifth: 'Quinta domanda: il budget.',
      results: { base: 'Base per il servizio rapido.', baseLow: 'Base per ruote piccole.', altaHigh: 'Ruote grandi:', altaRib: 'Ribassati:', cm: 'scegli CM.', puma: 'scegli Puma.', both: 'valuta entrambe.', mediaA: 'Media trifase.', mediaB: 'Media monofase.', baseMono: 'Con monofase verifica la potenza.' }
    }
  },
  disegni: [{ id: '03c89b2a1496afb3c082', title: 'Incasso PFA 40', model: 'PFA 40', size: 123456, codes: ['03100040'], name: 'Incasso_PFA40.pdf' }],
  guide: {
    domande: [{ q: 'Quante ruote al giorno?', a: 'Serve per la fascia.' }],
    regole: ['Si vende la postazione.'], leve: ['Garanzia'], obiezioni: [{ q: 'Costa troppo', a: 'Guarda la rata.' }],
    checklist: ['Corrente verificata', 'Spazio misurato'], contatti: 'Assistenza: numero di prova.'
  }
};

/** Preventivi di prova per i controlli dell'agente. */
export const PREVENTIVI = [
  { globalDisc: '', notes: '', items: [] },
  { globalDisc: '20', notes: '', items: [{ code: '01100313', power: '1ph 230V 50Hz', price: 9500, qty: 1, disc: '' }] },
  { globalDisc: '20', notes: 'Trasporto incluso per GEO 10', items: [{ code: '01100313', power: '1ph 230V 50Hz', price: 9500, qty: 1 }, { code: '25100040', power: '', price: 65, qty: 1 }, { code: '04100010', power: '', price: 15400, qty: 1 }] },
  { globalDisc: '30', notes: 'Trasporto incluso per PFA 40', items: [{ code: '03100040', power: '3ph 400V 50Hz', price: 6000, qty: 2 }, { code: '25100046', power: '', price: 1250, qty: 1 }] },
  { globalDisc: '10', notes: '', items: [{ code: '03100040', power: '3ph 400V 50Hz', price: 6000, qty: 1, disc: '0' }, { code: '02100101', power: '3ph 400V 50Hz', price: 8900, qty: 1 }] },
  { globalDisc: '', notes: '', items: [{ code: '01100313', power: '1ph 230V 50Hz', price: 9500, qty: 1, disc: '' }, { code: '02100100', power: '1ph 230V 50/60Hz', price: 7800, qty: 1, disc: '' }, { code: '02200201', power: '3ph 400V 50Hz', price: 19900, qty: 1, disc: '' }] },
  { globalDisc: '', notes: '', items: [{ code: '01100313', power: '1ph 230V 50Hz', price: 9500, qty: 1, disc: '12,5' }, { code: '02100100', power: '1ph 230V 50/60Hz', price: 7800, qty: 1, disc: '12,5' }, { code: '', custom: true, name: 'Trasporto', price: 120, qty: 1, disc: '0' }, { code: '', custom: true, name: 'Installazione e formazione', price: 300, qty: 1, disc: '0' }] },
  { globalDisc: '5', notes: '', items: [{ code: '02200201', power: '3ph 400V 50Hz', price: 19900, qty: 1, disc: '' }, { code: '99999999', custom: true, manual: true, name: 'Kit fuori listino', price: 0, qty: 1, disc: '' }, { code: '', custom: true, name: 'Trasporto Truck 26', price: 350, qty: 1, disc: '0' }] },
  { globalDisc: '', notes: '', items: [{ code: '05100002', power: '', price: 32000, qty: 1 }, { code: '02200200', power: '24V', price: 21500, qty: 1 }] }
];
