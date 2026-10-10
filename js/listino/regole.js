/*
 * Listino in tasca - regole commerciali di classificazione.
 *
 * Il listino PDF non dice sempre per quali veicoli e' pensata una macchina:
 * in quei casi il lettore la mostra per Auto, Moto e Truck. Queste regole
 * correggono i veicoli per famiglia di prodotto.
 *
 * Fonti:
 *  - QUOTE (prototipo web shop, A. Pezzali): GEO 10 / GEO 20 / GEO 25 -> auto,
 *    WL 85 MOVE -> truck (colonne mobili).
 *  - Listino 04/2026: WR 328A ha la configurazione camion (pag. 62);
 *    sollevatori a forbice, per officine e a 2 colonne hanno portate 3.000-5.500 kg
 *    (auto e commerciali leggeri).
 *
 * Le regole si applicano all'avvio, senza rileggere il PDF. Per tornare al
 * comportamento precedente basta svuotare l'elenco VEHICLE_RULES.
 */
(function (root) {
  'use strict';

  // Ogni regola: { test(famiglia) -> bool, vehicles: [...] }. Vince la prima che corrisponde.
  const VEHICLE_RULES = [
    { id: 'wr328a', test: f => /\bwr\s*328/i.test(f.title) && !f.accessory, vehicles: ['auto', 'truck'] },
    { id: 'geo', test: f => /^geo\s*(10|20|25)\b/i.test(f.title.trim()) && !f.accessory, vehicles: ['auto'] },
    { id: 'wl85', test: f => /\bwl\s*85\b/i.test(f.title), vehicles: ['truck'] },
    {
      id: 'sollevatori-officina',
      test: f => /^(sollevatori a forbice|sollevatori per officine|sollevatori a 2 colonne)/i.test(f.sub || ''),
      vehicles: ['auto']
    }
  ];

  function applyVehicleRules(catalog) {
    const famVehicles = {};
    for (const id of Object.keys(catalog.families)) {
      const f = catalog.families[id];
      const rule = VEHICLE_RULES.find(r => {
        try { return r.test(f); } catch (e) { return false; }
      });
      if (rule) {
        f.vehicles = rule.vehicles.slice();
        f.rule = rule.id;
        famVehicles[id] = f.vehicles;
      }
    }
    for (const p of catalog.products) {
      if (famVehicles[p.family]) p.vehicles = famVehicles[p.family].slice();
    }
    return catalog;
  }

  root.Regole = { VEHICLE_RULES, applyVehicleRules };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Regole;
})(typeof self !== 'undefined' ? self : this);
