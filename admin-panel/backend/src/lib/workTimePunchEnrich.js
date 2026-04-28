'use strict';

/**
 * Matrícula profissional / identificador exibido ao colaborador: campo dedicado no usuário; senão CFT, primeiro documento com identificador, ou ID interno.
 * @param {{ id?: string, employeeMatricula?: string | null, personalDocuments?: unknown, technicianProfile?: { cft?: string | null } | null } | null} u
 */
function deriveEmployeeMatriculaFromUser(u) {
  if (!u) return '';
  const explicit =
    u.employeeMatricula != null && String(u.employeeMatricula).trim() ? String(u.employeeMatricula).trim() : '';
  if (explicit) return explicit.slice(0, 80);
  const cft = u.technicianProfile && u.technicianProfile.cft != null ? String(u.technicianProfile.cft).trim() : '';
  if (cft) return cft.slice(0, 80);
  const docs = Array.isArray(u.personalDocuments) ? u.personalDocuments : [];
  for (const d of docs) {
    if (d && typeof d === 'object' && typeof d.identifier === 'string') {
      const id = d.identifier.trim();
      if (id) return id.slice(0, 80);
    }
  }
  return u.id ? String(u.id) : '';
}

/**
 * @param {unknown} snapshot — validationSnapshot JSON
 * @param {unknown} rawPayload
 */
function formatDeviceSummary(snapshot, rawPayload) {
  let d = null;
  if (snapshot && typeof snapshot === 'object' && snapshot.deviceInfo && typeof snapshot.deviceInfo === 'object') {
    d = snapshot.deviceInfo;
  }
  if (!d && rawPayload && typeof rawPayload === 'object' && rawPayload.deviceInfoClient && typeof rawPayload.deviceInfoClient === 'object') {
    d = rawPayload.deviceInfoClient;
  }
  if (!d || typeof d !== 'object') return '';
  const parts = [];
  const brandModel = [d.brand, d.modelName].filter((x) => x && String(x).trim()).map(String);
  if (brandModel.length) parts.push(brandModel.join(' ').trim());
  const os = [d.osName, d.osVersion].filter((x) => x && String(x).trim()).map(String);
  if (os.length) parts.push(os.join(' ').trim());
  const appV = d.appVersion || d.nativeAppVersion;
  if (appV) parts.push(`App ${String(appV).trim()}`);
  if (d.deviceName && String(d.deviceName).trim()) parts.push(String(d.deviceName).trim());
  if (d.platform) parts.push(String(d.platform));
  return parts.filter(Boolean).join(' · ');
}

function formatGpsLine(lat, lng, accuracy) {
  if (lat == null || lng == null) return '';
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
  const acc = accuracy != null && Number.isFinite(Number(accuracy)) ? Math.round(Number(accuracy)) : null;
  const accPart = acc != null ? ` · precisão ±${acc} m` : '';
  return `${la.toFixed(6)}, ${lo.toFixed(6)}${accPart}`;
}

/**
 * Anexa campos legíveis para app e relatórios. Remove o objeto `user` aninhado no output público.
 * @param {object} row — WorkTimePunch + user opcional
 * @param {{ stripUser?: boolean }} [opts]
 */
function enrichPunchRow(row, opts = {}) {
  const stripUser = !!opts.stripUser;
  const u = row.user || null;
  const { user, ...rest } = row;
  const employeeFullName = u && u.name ? String(u.name) : '';
  const employeeEmail =
    u && u.appAccount && u.appAccount.emailNorm
      ? String(u.appAccount.emailNorm).trim()
      : u && u.email
        ? String(u.email)
        : '';
  const employeeMatricula = deriveEmployeeMatriculaFromUser(u);
  const deviceSummary = formatDeviceSummary(rest.validationSnapshot, rest.rawPayload);
  const gpsLine = formatGpsLine(rest.lat, rest.lng, rest.accuracy);
  const out = {
    ...rest,
    employeeFullName,
    employeeEmail,
    employeeMatricula,
    deviceSummary,
    gpsLine,
  };
  if (!stripUser && u) out.user = u;
  return out;
}

module.exports = {
  deriveEmployeeMatriculaFromUser,
  formatDeviceSummary,
  formatGpsLine,
  enrichPunchRow,
};
