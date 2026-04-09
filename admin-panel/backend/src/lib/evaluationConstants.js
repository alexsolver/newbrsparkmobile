'use strict';

module.exports = {
  CRITICAL_THRESHOLD: 60,
  classifyTotal(score100) {
    if (score100 >= 80) return 'EXCELLENT';
    if (score100 >= 60) return 'GOOD';
    return 'CRITICAL';
  },
};
