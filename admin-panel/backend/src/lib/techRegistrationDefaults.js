'use strict';

function defaultEmptySchedule() {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const o = {};
  for (const d of days) {
    o[d] = [{ id: `s_${d}_0`, enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  }
  return o;
}

/** Payload inicial alinhado ao convite do painel / candidatura self-service. */
function initialTechRegistrationResponsesJson(email) {
  const em = String(email || '').trim().toLowerCase();
  return {
    email: em,
    name: '',
    technician: {
      workScheduleJson: defaultEmptySchedule(),
      serviceLocationIds: [],
      serviceCoverageGeoJson: null,
      professionalDocuments: [],
      skillsJson: [],
    },
    personalDocuments: [],
    faceEnrollmentPhotos: [],
  };
}

module.exports = {
  defaultEmptySchedule,
  initialTechRegistrationResponsesJson,
};
