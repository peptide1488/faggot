// Pepti Mart self-describing vial serial codec.
// Shared by the app (index.html) and the generator (generator.html) so they can never drift.
//
// Format:  PM-<CODE><MG>-<ORDER>-<VIAL>-<CHK>
//   PM      brand prefix
//   <CODE>  1-3 letter compound code (see CODE_TO_NAME below)
//   <MG>    vial strength in whole mg
//   <ORDER> customer order number (A-Z 0-9)
//   <VIAL>  vial number within the order (>=2 digits)
//   <CHK>   base-36 check character over the rest, catches typos/transpositions
//
// Example: PM-R10-7F3A-02-K  =>  Retatrutide 10 mg, order 7F3A, vial 02
(function (global) {
  var PREFIX = 'PM';

  // APPEND-ONLY. Adding a peptide = add a new code here. Never reuse or change an
  // existing code, or already-printed tags would decode to the wrong product.
  var CODE_TO_NAME = {
    R:  'Retatrutide',
    T:  'Tirzepatide',
    S:  'Semaglutide',
    L:  'Liraglutide',
    C:  'Cagrilintide',
    U:  'Survodutide',
    MZ: 'Mazdutide',
    BPC:'BPC-157',
    TB: 'TB-500',
    GHK:'GHK-Cu',
    IPA:'Ipamorelin',
    CJC:'CJC-1295'
  };

  var NAME_TO_CODE = {};
  Object.keys(CODE_TO_NAME).forEach(function (code) {
    NAME_TO_CODE[CODE_TO_NAME[code].toLowerCase()] = code;
  });

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

  function codeForCompound(name) {
    if (!name) return null;
    if (CODE_TO_NAME[name]) return name;                 // already a code
    return NAME_TO_CODE[String(name).toLowerCase()] || null;
  }

  // opts: { compound: name-or-code, mg, order, vial }
  function encode(opts) {
    var code = codeForCompound(opts.compound);
    if (!code) throw new Error('Unknown compound: ' + opts.compound);
    var mg = Math.round(+opts.mg);
    if (!(mg > 0)) throw new Error('Invalid mg: ' + opts.mg);
    var order = String(opts.order || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!order) throw new Error('Order number required');
    var vial = String(opts.vial == null ? 1 : opts.vial)
      .toUpperCase().replace(/[^A-Z0-9]/g, '').padStart(2, '0');
    var body = PREFIX + '-' + code + mg + '-' + order + '-' + vial;
    return body + '-' + checkChar(body);
  }

  function decode(serial) {
    var s = String(serial || '').trim().toUpperCase();
    var parts = s.split('-');
    if (parts.length !== 5 || parts[0] !== PREFIX) return { valid: false, reason: 'format' };
    var compdose = parts[1], order = parts[2], vial = parts[3], chk = parts[4];
    var body = PREFIX + '-' + compdose + '-' + order + '-' + vial;
    if (checkChar(body) !== chk) return { valid: false, reason: 'checksum' };
    var m = compdose.match(/^([A-Z]+)(\d+)$/);
    if (!m) return { valid: false, reason: 'compdose' };
    var code = m[1], mg = +m[2];
    var compound = CODE_TO_NAME[code];
    if (!compound) return { valid: false, reason: 'unknown-code', code: code, mg: mg, order: order, vial: vial };
    return { valid: true, serial: s, compound: compound, code: code, mg: mg, order: order, vial: String(+vial) };
  }

  var api = {
    PREFIX: PREFIX,
    CODE_TO_NAME: CODE_TO_NAME,
    encode: encode,
    decode: decode,
    checkChar: checkChar,
    codeForCompound: codeForCompound
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PMSerial = api;
})(typeof window !== 'undefined' ? window : this);
