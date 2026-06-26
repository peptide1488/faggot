// Pepti Mart self-describing vial serial codec.
// Shared by the app (index.html) and the generator (generator.html) so they can never drift.
//
// Format:  PM-<CODE>-<STRENGTH>-<ORDER>-<VIAL>-<CHK>
//   PM         brand prefix
//   <CODE>     product code, A-Z0-9 (see PRODUCTS below)
//   <STRENGTH> number + unit, e.g. 10MG, 100MCG, 5000IU. A decimal point is
//              written as "P" so the serial stays alphanumeric (0.1mg -> 0P1MG).
//   <ORDER>    customer order number (A-Z 0-9)
//   <VIAL>     vial number within the order (>=2 digits)
//   <CHK>      base-36 check character over everything before it
//
// Example: PM-RETA-10MG-7F3A-02-K  =>  Retatrutide 10 mg, order 7F3A, vial 02
(function (global) {
  var PREFIX = 'PM';

  // APPEND-ONLY product table. Adding a product = add a row. Never change or
  // reuse an existing CODE, or already-printed tags decode to the wrong product.
  // doses are suggestions for the generator UI; the generator can override.
  // slug = product page on peptimart.xyz (/products/<slug>)
  var PRODUCTS = [
    // GLP-1 / metabolic
    { code: 'RETA',    name: 'Retatrutide',                 unit: 'mg', doses: [5, 10, 20], slug:'retatrutide' },
    { code: 'TIRZ',    name: 'Tirzepatide',                 unit: 'mg', doses: [5, 10, 15, 30, 60], slug:'tirzepatide' },
    { code: 'SEMA',    name: 'Semaglutide',                 unit: 'mg', doses: [5, 10], slug:'semaglutide' },
    { code: 'CAGRI',   name: 'Cagrilintide',                unit: 'mg', doses: [5], slug:'cagrilintide' },
    { code: 'CAGSEM',  name: 'Cagrilintide / Semaglutide',  unit: 'mg', doses: [10], slug:'cagrilintide-semaglutide' },
    { code: 'SURVO',   name: 'Survodutide',                 unit: 'mg', doses: [10], slug:'survodutide' },
    { code: 'ADIPO',   name: 'Adipotide',                   unit: 'mg', doses: [5], slug:'adipotide' },
    { code: 'AOD',     name: 'AOD-9604',                    unit: 'mg', doses: [2], slug:'aod-9604' },
    { code: 'AMINO',   name: '5-Amino-1MQ',                 unit: 'mg', doses: [5], slug:'5-amino-1mq' },
    { code: 'SLU',     name: 'SLU-PP-332',                  unit: 'mg', doses: [5], slug:'slu-pp-332' },
    // Healing / recovery
    { code: 'BPC',     name: 'BPC-157',                     unit: 'mg', doses: [5, 10], slug:'bpc-157' },
    { code: 'TB',      name: 'TB-500',                      unit: 'mg', doses: [2, 10], slug:'tb500' },
    { code: 'BPCTB',   name: 'BPC-157 / TB-500 Blend',      unit: 'mg', doses: [10], slug:'bpc-tb-blend' },
    { code: 'KPV',     name: 'KPV',                         unit: 'mg', doses: [10], slug:'kpv' },
    { code: 'GHK',     name: 'GHK-Cu',                      unit: 'mg', doses: [50, 100], slug:'ghk-cu' },
    { code: 'LL37',    name: 'LL-37',                       unit: 'mg', doses: [5], slug:'ll37' },
    { code: 'GLOW',    name: 'GLOW Blend (TB/BPC/GHK)',     unit: 'mg', doses: [70], slug:'glow-tb10mg-bpc-157-10mg-ghk50mg' },
    { code: 'KLOW',    name: 'KLOW Blend (TB/BPC/GHK/KPV)', unit: 'mg', doses: [80], slug:'klow-tb10mg-bpc-157-10mg-ghk50mg-kpv10mg' },
    // Growth-hormone secretagogues
    { code: 'CJCDAC',  name: 'CJC-1295 with DAC',           unit: 'mg', doses: [2], slug:'cjc-1295-with-dac' },
    { code: 'CJC',     name: 'CJC-1295 (no DAC)',           unit: 'mg', doses: [2], slug:'cjc-1295-without-dac' },
    { code: 'CJCIPA',  name: 'CJC-1295 / Ipamorelin',       unit: 'mg', doses: [10], slug:'cjc-1295-without-dac-ipamorelin' },
    { code: 'IPA',     name: 'Ipamorelin',                  unit: 'mg', doses: [5], slug:'ipamorelin' },
    { code: 'GHRP2',   name: 'GHRP-2',                      unit: 'mg', doses: [5], slug:'ghrp-2-acetate' },
    { code: 'GHRP6',   name: 'GHRP-6',                      unit: 'mg', doses: [5], slug:'ghrp-6-acetate' },
    { code: 'HEXA',    name: 'Hexarelin',                   unit: 'mg', doses: [5], slug:'hexarelin-acetate' },
    { code: 'SERMO',   name: 'Sermorelin',                  unit: 'mg', doses: [5], slug:'sermorelin' },
    { code: 'TESA',    name: 'Tesamorelin',                 unit: 'mg', doses: [2], slug:'tesamorelin' },
    { code: 'MGF',     name: 'MGF',                         unit: 'mg', doses: [2], slug:'mgf' },
    { code: 'PEGMGF',  name: 'PEG-MGF',                     unit: 'mg', doses: [2], slug:'peg-mgf' },
    { code: 'IGF',     name: 'IGF-1 LR3',                   unit: 'mg', doses: [0.1], slug:'igf-1-lr3' },
    { code: 'HGH',     name: 'HGH 191aa (Somatropin)',      unit: 'iu', doses: [10], slug:'hgh-191aa-somatropin' },
    // Longevity / mitochondrial
    { code: 'MOTS',    name: 'MOTS-c',                      unit: 'mg', doses: [10, 20], slug:'mots-c' },
    { code: 'NAD',     name: 'NAD+',                        unit: 'mg', doses: [100, 500], slug:'nad' },
    { code: 'EPI',     name: 'Epitalon',                    unit: 'mg', doses: [10], slug:'epitalon' },
    { code: 'THYM',    name: 'Thymalin',                    unit: 'mg', doses: [10], slug:'thymalin' },
    { code: 'FOXO',    name: 'FOXO4-DRI',                   unit: 'mg', doses: [10], slug:'foxo4' },
    { code: 'SS31',    name: 'SS-31',                       unit: 'mg', doses: [10], slug:'ss-31' },
    { code: 'GLUT',    name: 'Glutathione',                 unit: 'mg', doses: [600], slug:'glutathione' },
    { code: 'ARA',     name: 'ARA-290',                     unit: 'mg', doses: [10], slug:'ara-290' },
    { code: 'AICAR',   name: 'AICAR',                       unit: 'mg', doses: [50], slug:'aicar' },
    // Cognitive / nootropic
    { code: 'SELANK',  name: 'Selank',                      unit: 'mg', doses: [5], slug:'selank' },
    { code: 'SEMAX',   name: 'Semax',                       unit: 'mg', doses: [5], slug:'semax' },
    { code: 'DSIP',    name: 'DSIP',                        unit: 'mg', doses: [5], slug:'dsip' },
    { code: 'VIP',     name: 'VIP',                         unit: 'mg', doses: [10], slug:'vip' },
    // Sexual / cosmetic
    { code: 'PT141',   name: 'PT-141',                      unit: 'mg', doses: [10], slug:'pt-141' },
    { code: 'MT1',     name: 'Melanotan-1',                 unit: 'mg', doses: [10], slug:'melanotan-1' },
    { code: 'MT2',     name: 'Melanotan-2',                 unit: 'mg', doses: [10], slug:'mt-2-melanotan-2-acetate' },
    { code: 'OXY',     name: 'Oxytocin',                    unit: 'mg', doses: [2], slug:'oxytocin-acetate' },
    { code: 'KISS',    name: 'Kisspeptin-10',               unit: 'mg', doses: [5], slug:'kisspeptin-10' },
    { code: 'DERMO',   name: 'Dermorphin',                  unit: 'mg', doses: [5], slug:'dermorphin' },
    { code: 'GONA',    name: 'Gonadorelin',                 unit: 'mg', doses: [2], slug:'gonadorelin' },
    // Hormones / fertility
    { code: 'HCG',     name: 'HCG',                         unit: 'iu', doses: [5000], slug:'hcg' },
    { code: 'HMG',     name: 'HMG',                         unit: 'iu', doses: [75], slug:'hmg' }
  ];

  var CODE_TO_NAME = {}, CODE_TO_PRODUCT = {}, NAME_TO_CODE = {};
  PRODUCTS.forEach(function (p) {
    CODE_TO_NAME[p.code] = p.name;
    CODE_TO_PRODUCT[p.code] = p;
    NAME_TO_CODE[p.name.toLowerCase()] = p.code;
  });

  var UNITS = ['MG', 'MCG', 'IU', 'ML'];

  var ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function checkChar(payload) {
    var up = String(payload).toUpperCase().replace(/-/g, '');
    var sum = 0;
    for (var i = 0; i < up.length; i++) {
      var v = ALPHA.indexOf(up[i]);
      if (v < 0) v = 0;
      sum += v * (i % 2 ? 3 : 1); // alternating weights catch transpositions
    }
    return ALPHA[sum % 36];
  }

  function codeForCompound(nameOrCode) {
    if (!nameOrCode) return null;
    var k = String(nameOrCode);
    if (CODE_TO_NAME[k.toUpperCase()]) return k.toUpperCase();   // already a code
    return NAME_TO_CODE[k.toLowerCase()] || null;
  }

  var CATALOG_URL = 'https://peptimart.xyz/catalog';
  function productUrl(nameOrCode) {
    var code = codeForCompound(nameOrCode);
    var p = code && CODE_TO_PRODUCT[code];
    return (p && p.slug) ? 'https://peptimart.xyz/products/' + p.slug : CATALOG_URL;
  }

  // "10" -> "10", "0.1" -> "0P1"
  function encodeNumber(n) {
    return String(n).trim().replace(/\./g, 'P').toUpperCase();
  }
  function decodeNumber(tok) {
    return parseFloat(String(tok).replace(/P/gi, '.'));
  }

  // opts: { compound: name-or-code, strength: number, unit, order, vial }
  function encode(opts) {
    var code = codeForCompound(opts.compound);
    if (!code) throw new Error('Unknown product: ' + opts.compound);
    var strength = +opts.strength;
    if (!(strength > 0)) throw new Error('Invalid strength: ' + opts.strength);
    var unit = String(opts.unit || CODE_TO_PRODUCT[code].unit || 'mg').toUpperCase();
    if (UNITS.indexOf(unit) < 0) throw new Error('Unknown unit: ' + opts.unit);
    var order = String(opts.order || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!order) throw new Error('Order number required');
    var vial = String(opts.vial == null ? 1 : opts.vial)
      .toUpperCase().replace(/[^A-Z0-9]/g, '').padStart(2, '0');
    var body = PREFIX + '-' + code + '-' + encodeNumber(strength) + unit + '-' + order + '-' + vial;
    return body + '-' + checkChar(body);
  }

  function decode(serial) {
    var s = String(serial || '').trim().toUpperCase();
    var parts = s.split('-');
    if (parts.length !== 6 || parts[0] !== PREFIX) return { valid: false, reason: 'format' };
    var code = parts[1], strengthTok = parts[2], order = parts[3], vial = parts[4], chk = parts[5];
    var body = PREFIX + '-' + code + '-' + strengthTok + '-' + order + '-' + vial;
    if (checkChar(body) !== chk) return { valid: false, reason: 'checksum' };
    var m = strengthTok.match(/^(\d+(?:P\d+)?)(MG|MCG|IU|ML)$/);
    if (!m) return { valid: false, reason: 'strength' };
    var strength = decodeNumber(m[1]), unit = m[2].toLowerCase();
    var name = CODE_TO_NAME[code];
    if (!name) return { valid: false, reason: 'unknown-code', code: code, strength: strength, unit: unit, order: order, vial: vial };
    // milligram equivalent for the app's mg-based dosing math (iu/ml pass through unchanged)
    var mg = unit === 'mcg' ? strength / 1000 : strength;
    return {
      valid: true, serial: s, code: code, compound: name,
      strength: strength, unit: unit, mg: mg,
      strengthText: strength + ' ' + unit,
      order: order, vial: String(+vial)
    };
  }

  // ---- verification code (2nd factor printed on the vial) ----
  // The code is HMAC-SHA256(secret, serial) truncated to a short typeable string.
  // NOTE: this secret ships in the app, so the code is a strong DETERRENT against
  // casual tag cloning, not unforgeable against someone who reverse-engineers the
  // app. Changing this secret invalidates every code already printed — keep it stable.
  var VERIFY_SECRET = 'pm_verify_v1_8tF3kQ9zR2wLp6Yh-do-not-change';
  // Crockford-style base32 without I, L, O, U to avoid look-alikes when typing.
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function bytesToB32(bytes, len) {
    var bits = 0, val = 0, out = '';
    for (var i = 0; i < bytes.length && out.length < len; i++) {
      val = (val << 8) | bytes[i]; bits += 8;
      while (bits >= 5 && out.length < len) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    return out;
  }
  function normalizeCode(s) {
    return String(s || '').toUpperCase()
      .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V')  // forgive common typos
      .replace(/[^0-9A-Z]/g, '');
  }
  function subtle() {
    var c = (typeof globalThis !== 'undefined' ? globalThis : global).crypto;
    if (!c || !c.subtle) throw new Error('Web Crypto unavailable (needs HTTPS/localhost)');
    return c.subtle;
  }
  async function verifyCode(serial) {
    var enc = new TextEncoder();
    var key = await subtle().importKey('raw', enc.encode(VERIFY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var sig = await subtle().sign('HMAC', key, enc.encode(String(serial).trim().toUpperCase()));
    return bytesToB32(new Uint8Array(sig), 7);       // 7 chars ~ 35 bits, e.g. Q262JH2
  }
  async function checkVerifyCode(serial, input) {
    var expected = await verifyCode(serial);
    return !!input && normalizeCode(input) === normalizeCode(expected);
  }

  var api = {
    PREFIX: PREFIX, PRODUCTS: PRODUCTS, CODE_TO_NAME: CODE_TO_NAME, UNITS: UNITS,
    encode: encode, decode: decode, checkChar: checkChar, codeForCompound: codeForCompound,
    verifyCode: verifyCode, checkVerifyCode: checkVerifyCode, normalizeCode: normalizeCode,
    productUrl: productUrl, CATALOG_URL: CATALOG_URL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PMSerial = api;
})(typeof window !== 'undefined' ? window : this);
