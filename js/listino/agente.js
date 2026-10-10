/*
 * Listino in tasca - informazioni riservate per l'agente.
 *
 * Il file data/agente.pack.json e' cifrato (AES-GCM 256). La chiave non e'
 * nell'app: si ricava dal listino PDF caricato sul telefono (codici e prezzi
 * di tutti gli articoli). Senza quel listino il file non si puo' leggere.
 * Dopo lo sblocco il contenuto resta solo sul dispositivo (IndexedDB).
 */
(function (root) {
  'use strict';

  const PACK_URL = 'data/agente.pack.json';
  const KDF_LABEL = 'listino-in-tasca/agente/v1\n';

  /** Testo canonico del listino: "codice=prezzo" ordinati, uno per riga. */
  function canonical(catalog) {
    const set = new Set();
    for (const p of catalog.products) set.add(p.code + '=' + Number(p.price).toFixed(2));
    return [...set].sort().join('\n');
  }

  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(catalog, subtle) {
    const data = new TextEncoder().encode(KDF_LABEL + canonical(catalog));
    const hash = await subtle.digest('SHA-256', data);
    return subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  async function decrypt(packFile, catalog, subtle) {
    const key = await deriveKey(catalog, subtle);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64(packFile.iv) }, key, b64(packFile.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /**
   * Prova a sbloccare il pacchetto con il listino caricato.
   * Ritorna { pack } se riesce, { error } se il listino non corrisponde o il file manca.
   */
  async function unlock(catalog) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return { error: 'nocrypto' };
    let file;
    try {
      const res = await fetch(PACK_URL, { cache: 'no-cache' });
      if (!res.ok) return { error: 'nofile' };
      file = await res.json();
    } catch (e) {
      return { error: 'nofile' };
    }
    try {
      const pack = await decrypt(file, catalog, subtle);
      return { pack, packId: file.id || '' };
    } catch (e) {
      return { error: 'nomatch' };
    }
  }

  /** Scarica e decifra un disegno (data/d/<id>.bin = IV di 12 byte + dati cifrati). */
  async function decryptFile(catalog, id) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) throw new Error('Questo browser non supporta la decifratura');
    const res = await fetch('data/d/' + encodeURIComponent(id) + '.bin');
    if (!res.ok) throw new Error('Disegno non raggiungibile: serve la connessione la prima volta');
    const buf = new Uint8Array(await res.arrayBuffer());
    const key = await deriveKey(catalog, subtle);
    try {
      return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)));
    } catch (e) {
      throw new Error('Il disegno non si apre con il listino caricato');
    }
  }

  root.Agente = { unlock, canonical, decrypt, decryptFile, KDF_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Agente;
})(typeof self !== 'undefined' ? self : this);
