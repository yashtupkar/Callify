/**
 * Helpers that keep a Meta webhook payload scoped to a single WhatsApp
 * connection. Meta may batch several entries/changes (different WABAs or phone
 * numbers) into one POST, so routing on entry[0] alone can leak messages from one
 * tenant's number into another tenant's automation.
 */

function changeScope(entry, change) {
  const value = change?.value || {};
  return {
    phoneNumberId: value.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null,
    wabaId: entry?.id ? String(entry.id) : null,
  };
}

function eachChange(body, visit) {
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return;
  for (const entry of body.entry) {
    for (const change of entry?.changes || []) visit(entry, change);
  }
}

/** Distinct phone_number_ids present in the payload. */
function extractPhoneNumberIds(body) {
  const ids = new Set();
  eachChange(body, (entry, change) => {
    const { phoneNumberId } = changeScope(entry, change);
    if (phoneNumberId) ids.add(phoneNumberId);
  });
  return [...ids];
}

/** Distinct WABA ids (entry ids) present in the payload. */
function extractWabaIds(body) {
  const ids = new Set();
  eachChange(body, (entry, change) => {
    const { wabaId } = changeScope(entry, change);
    if (wabaId) ids.add(wabaId);
  });
  return [...ids];
}

/**
 * Returns a copy of `body` containing only the changes that belong to the given
 * connection. A change belongs to a connection when its phone_number_id equals the
 * connection's phoneNumberId; when the connection has no phoneNumberId the WABA id
 * is used instead. Changes without any identifying metadata are dropped.
 */
function scopeBodyToConnection(body, connection) {
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return body;
  const phoneNumberId = connection.phoneNumberId ? String(connection.phoneNumberId) : null;
  const businessId = connection.businessId ? String(connection.businessId) : null;
  const entries = [];
  for (const entry of body.entry) {
    const changes = (entry?.changes || []).filter((change) => {
      const scope = changeScope(entry, change);
      if (phoneNumberId) return scope.phoneNumberId === phoneNumberId;
      if (businessId) return scope.wabaId === businessId;
      return false;
    });
    if (changes.length) entries.push({ ...entry, changes });
  }
  return { ...body, entry: entries };
}

function bodyHasStatuses(body) {
  let found = false;
  eachChange(body, (entry, change) => {
    if (Array.isArray(change?.value?.statuses) && change.value.statuses.length) found = true;
  });
  return found;
}

module.exports = { extractPhoneNumberIds, extractWabaIds, scopeBodyToConnection, bodyHasStatuses };
