'use strict';

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCoverageHomeBase(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = toFiniteNumber(raw.latitude);
  const longitude = toFiniteNumber(raw.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude,
    longitude,
    address: raw.address ? String(raw.address).trim().slice(0, 240) : null,
    city: raw.city ? String(raw.city).trim().slice(0, 120) : null,
    state: raw.state ? String(raw.state).trim().slice(0, 80) : null,
    postalCode: raw.postalCode ? String(raw.postalCode).trim().slice(0, 40) : null,
    countryCode: raw.countryCode ? String(raw.countryCode).trim().slice(0, 8).toUpperCase() : null,
  };
}

function normalizeServiceCoverageGeo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const homeBase = normalizeCoverageHomeBase(raw.homeBase);
  const radiusKm = toFiniteNumber(raw.radiusKm);
  if (!homeBase || radiusKm == null) return null;
  const clampedRadiusKm = Math.min(Math.max(radiusKm, 1), 500);
  return {
    homeBase,
    radiusKm: Math.round(clampedRadiusKm * 10) / 10,
    notes: raw.notes ? String(raw.notes).trim().slice(0, 500) : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  normalizeServiceCoverageGeo,
};
