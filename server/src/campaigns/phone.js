/**
 * Normalises a phone number to digits-only E.164 (no '+'), the format both providers accept.
 * National numbers are only accepted when a default country code is supplied, so a bare
 * "9876543210" is never silently sent to the wrong country.
 */
function normalizePhone(raw, { defaultCountryCode } = {}) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };
  let text = String(raw).trim();
  if (!text) return { ok: false, reason: 'empty' };

  // Spreadsheets often turn long numbers into 9.1987654321E+11 or 919876543210.0
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(text)) {
    const value = Number(text);
    if (Number.isFinite(value) && value < Number.MAX_SAFE_INTEGER) text = String(Math.round(value));
  } else if (/^\d+\.0+$/.test(text)) {
    text = text.split('.')[0];
  }

  if (!/^[\d\s\-().+]+$/.test(text)) return { ok: false, reason: 'invalid_characters' };
  if ((text.match(/\+/g) || []).length > 1 || (text.includes('+') && !text.startsWith('+'))) {
    return { ok: false, reason: 'invalid_format' };
  }

  let digits = text.replace(/\D/g, '');
  let international = text.startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (!international) {
    const cc = String(defaultCountryCode || '').replace(/\D/g, '');
    if (!cc) return { ok: false, reason: 'missing_country_code' };
    digits = digits.replace(/^0+/, '');
    if (!(digits.startsWith(cc) && digits.length >= 11)) digits = cc + digits;
  }

  if (digits.startsWith('0')) return { ok: false, reason: 'invalid_country_code' };
  if (digits.length < 8) return { ok: false, reason: 'too_short' };
  if (digits.length > 15) return { ok: false, reason: 'too_long' };
  return { ok: true, phone: digits };
}

module.exports = { normalizePhone };
