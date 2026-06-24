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
  var PRODUCTS = [
    // GLP-1 / metabolic
    { code: 'RETA',    name: 'Retatrutide',                 unit: 'mg', doses: [5, 10, 20] },
    { code: 'TIRZ',    name: 'Tirzepatide',                 unit: 'mg', doses: [5, 10, 15, 30, 60] },
    { code: 'SEMA',    name: 'Semaglutide',                 unit: 'mg', doses: [5, 10] },
    { code: 'CAGRI',   name: 'Cagrilintide',                unit: 'mg', doses: [5] },
    { code: 'CAGSEM',  name: 'Cagrilintide / Semaglutide',  unit: 'mg', doses: [10] },
    { code: 'SURVO',   name: 'Survodutide',                 unit: 'mg', doses: [10] },
    { code: 'ADIPO',   name: 'Adipotide',                   unit: 'mg', doses: [5] },
    { code: 'AOD',     name: 'AOD-9604',                    unit: 'mg', doses: [2] },
    { code: 'AMINO',   name: '5-Amino-1MQ',                 unit: 'mg', doses: [5] },
    { code: 'SLU',     name: 'SLU-PP-332',                  unit: 'mg', doses: [5] },
    // Healing / recovery
    { code: 'BPC',     name: 'BPC-157',                     unit: 'mg', doses: [5, 10] },
    { code: 'TB',      name: 'TB-500',                      unit: 'mg', doses: [2, 10] },
    { code: 'BPCTB',   name: 'BPC-157 / TB-500 Blend',      unit: 'mg', doses: [10] },
    { code: 'KPV',     name: 'KPV',                         unit: 'mg', doses: [10] },
    { code: 'GHK',     name: 'GHK-Cu',                      unit: 'mg', doses: [50, 100] },
    { code: 'LL37',    name: 'LL-37',                       unit: 'mg', doses: [5] },
    { code: 'GLOW',    name: 'GLOW Blend (TB/BPC/GHK)',     unit: 'mg', doses: [70] },
    { code: 'KLOW',    name: 'KLOW Blend (TB/BPC/GHK/KPV)', unit: 'mg', doses: [80] },
    // Growth-hormone secretagogues
    { code: 'CJCDAC',  name: 'CJC-1295 with DAC',           unit: 'mg', doses: [2] },
    { code: 'CJC',     name: 'CJC-1295 (no DAC)',           unit: 'mg', doses: [2] },
    { code: 'CJCIPA',  name: 'CJC-1295 / Ipamorelin',       unit: 'mg', doses: [10] },
    { code: 'IPA',     name: 'Ipamorelin',                  unit: 'mg', doses: [5] },
    { code: 'GHRP2',   name: 'GHRP-2',                      unit: 'mg', doses: [5] },
    { code: 'GHRP6',   name: 'GHRP-6',                      unit: 'mg', doses: [5] },
    { code: 'HEXA',    name: 'Hexarelin',                   unit: 'mg', doses: [5] },
    { code: 'SERMO',   name: 'Sermorelin',                  unit: 'mg', doses: [5] },
    { code: 'TESA',    name: 'Tesamorelin',                 unit: 'mg', doses: [2] },
    { code: 'MGF',     name: 'MGF',                         unit: 'mg', doses: [2] },
    { code: 'PEGMGF',  name: 'PEG-MGF',                     unit: 'mg', doses: [2] },
    { code: 'IGF',     name: 'IGF-1 LR3',                   unit: 'mg', doses: [0.1] },
    { code: 'HGH',     name: 'HGH 191aa (Somatropin)',      unit: 'iu', doses: [10] },
    // Longevity / mitochondrial
    { code: 'MOTS',    name: 'MOTS-c',                      unit: 'mg', doses: [10, 20] },
    { code: 'NAD',     name: 'NAD+',                        unit: 'mg', doses: [100, 500] },
    { code: 'EPI',     name: 'Epitalon',                    unit: 'mg', doses: [10] },
    { code: 'THYM',    name: 'Thymalin',                    unit: 'mg', doses: [10] },
    { code: 'FOXO',    name: 'FOXO4-DRI',                   unit: 'mg', doses: [10] },
    { code: 'SS31',    name: 'SS-31',                       unit: 'mg', doses: [10] },
    { code: 'GLUT',    name: 'Glutathione',                 unit: 'mg', doses: [600] },
    { code: 'ARA',     name: 'ARA-290',                     unit: 'mg', doses: [10] },
    { code: 'AICAR',   name: 'AICAR',                       unit: 'mg', doses: [50] },
    // Cognitive / nootropic
    { code: 'SELANK',  name: 'Selank',                      unit: 'mg', doses: [5] },
    { code: 'SEMAX',   name: 'Semax',                       unit: 'mg', doses: [5] },
    { code: 'DSIP',    name: 'DSIP',                        unit: 'mg', doses: [5] },
    { code: 'VIP',     name: 'VIP',                         unit: 'mg', doses: [10] },
    // Sexual / cosmetic
    { code: 'PT141',   name: 'PT-141',                      unit: 'mg', doses: [10] },
    { code: 'MT1',     name: 'Melanotan-1',                 unit: 'mg', doses: [10] },
    { code: 'MT2',     name: 'Melanotan-2',                 unit: 'mg', doses: [10] },
    { code: 'OXY',     name: 'Oxytocin',                    unit: 'mg', doses: [2] },
    { code: 'KISS',    name: 'Kisspeptin-10',               unit: 'mg', doses: [5] },
    { code: 'DERMO',   name: 'Dermorphin',                  unit: 'mg', doses: [5] },
    { code: 'GONA',    name: 'Gonadorelin',                 unit: 'mg', doses: [2] },
    // Hormones / fertility
    { code: 'HCG',     name: 'HCG',                         unit: 'iu', doses: [5000] },
    { code: 'HMG',     name: 'HMG',                         unit: 'iu', doses: [75] }
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

  var api = {
    PREFIX: PREFIX, PRODUCTS: PRODUCTS, CODE_TO_NAME: CODE_TO_NAME, UNITS: UNITS,
    encode: encode, decode: decode, checkChar: checkChar, codeForCompound: codeForCompound
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PMSerial = api;
})(typeof window !== 'undefined' ? window : this);
