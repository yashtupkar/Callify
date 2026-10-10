const { normalizePhone } = require('./phone');

const PHONE_HEADER = /^(phone|mobile|whatsapp|wa|number|contact|tel|telephone|cell|msisdn)/i;
const NAME_HEADER = /^(name|full[\s_-]?name|first[\s_-]?name|customer|contact[\s_-]?name)$/i;
const CONSENT_HEADER = /^(opt[\s_-]?in|consent|subscribed|whatsapp[\s_-]?opt[\s_-]?in)$/i;
const FALSY = new Set(['no', 'n', 'false', '0', 'off', 'unsubscribed', 'opted out', 'opt-out', 'optout']);
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_VALUE_LENGTH = 1024;

class RecipientInputError extends Error {
  constructor(message, code = 'INVALID_RECIPIENTS') {
    super(message);
    this.code = code;
    this.status = 400;
  }
}

const cleanValue = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, MAX_VALUE_LENGTH);

const cleanKey = (key) => String(key ?? '').trim().slice(0, 64);

/**
 * Turns an uploaded sheet ({ columns, rows }) and/or manually typed numbers into
 * validated, de-duplicated recipients. First occurrence of a number wins.
 */
function parseRecipients({ file, manualNumbers, defaultCountryCode, phoneColumn, maxRecipients = 10000, maxRows = 50000 } = {}) {
  const candidates = [];
  let columns = [];

  if (file) {
    if (!Array.isArray(file.columns) || !Array.isArray(file.rows)) {
      throw new RecipientInputError('Uploaded file must contain columns and rows');
    }
    if (file.rows.length > maxRows) {
      throw new RecipientInputError(`File has too many rows (max ${maxRows})`, 'TOO_MANY_ROWS');
    }
    columns = file.columns.map(cleanKey).filter((c) => c && !BLOCKED_KEYS.has(c));
    const phoneKey = phoneColumn
      ? columns.find((c) => c === phoneColumn)
      : columns.find((c) => PHONE_HEADER.test(c));
    if (!phoneKey) throw new RecipientInputError('Could not find a phone number column. Choose one explicitly.', 'NO_PHONE_COLUMN');
    const nameKey = columns.find((c) => NAME_HEADER.test(c));
    const consentKey = columns.find((c) => CONSENT_HEADER.test(c));

    file.rows.forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      const rawPhone = cleanValue(row[phoneKey]);
      const isBlankRow = columns.every((c) => !cleanValue(row[c]));
      if (isBlankRow) return;
      const variables = {};
      for (const column of columns) {
        if (column === phoneKey) continue;
        variables[column] = cleanValue(row[column]);
      }
      candidates.push({
        rawPhone,
        name: nameKey ? cleanValue(row[nameKey]) || null : null,
        variables,
        consent: consentKey ? cleanValue(row[consentKey]).toLowerCase() : null,
        source: `row ${index + 2}`,
      });
    });
  }

  if (typeof manualNumbers === 'string' && manualNumbers.trim()) {
    for (const piece of manualNumbers.split(/[\n,;]+/)) {
      const rawPhone = cleanValue(piece);
      if (rawPhone) candidates.push({ rawPhone, name: null, variables: {}, consent: null, source: 'manual' });
    }
  }

  if (!candidates.length) throw new RecipientInputError('Add at least one recipient', 'NO_RECIPIENTS');

  const seen = new Set();
  const valid = [];
  const invalid = [];
  const noConsent = [];
  let duplicates = 0;

  for (const candidate of candidates) {
    const result = normalizePhone(candidate.rawPhone, { defaultCountryCode });
    if (!result.ok) {
      invalid.push({ rawPhone: candidate.rawPhone, reason: result.reason, source: candidate.source });
      continue;
    }
    if (seen.has(result.phone)) {
      duplicates += 1;
      continue;
    }
    seen.add(result.phone);
    if (candidate.consent !== null && FALSY.has(candidate.consent)) {
      noConsent.push({ phone: result.phone, name: candidate.name, variables: candidate.variables });
      continue;
    }
    valid.push({ phone: result.phone, name: candidate.name, variables: candidate.variables });
  }

  if (valid.length + noConsent.length > maxRecipients) {
    throw new RecipientInputError(`A campaign supports at most ${maxRecipients} recipients on this channel`, 'TOO_MANY_RECIPIENTS');
  }

  return { valid, invalid, noConsent, duplicates, columns, total: candidates.length };
}

module.exports = { parseRecipients, RecipientInputError };
