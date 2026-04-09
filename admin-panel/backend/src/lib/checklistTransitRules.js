/**
 * Regras de schema: início/fim de deslocamento (transit_start / transit_end).
 */

const MSG_END_BEFORE_START =
    'O campo «Finalizar deslocamento» não pode aparecer antes de «Iniciar deslocamento» (nem sem este último).';
const MSG_START_WITHOUT_END =
    'Se o formulário inclui «Iniciar deslocamento», também tem de incluir «Finalizar deslocamento».';

/**
 * @param {unknown[]} schemaData
 * @returns {string | null} mensagem de erro ou null se válido
 */
function validateChecklistTransitDisplacement(schemaData) {
    if (!Array.isArray(schemaData)) return null;
    let seenStart = false;
    for (const f of schemaData) {
        if (!f || typeof f !== 'object') continue;
        if (f.type === 'transit_start') seenStart = true;
        if (f.type === 'transit_end' && !seenStart) return MSG_END_BEFORE_START;
    }
    const hasStart = schemaData.some((f) => f && f.type === 'transit_start');
    const hasEnd = schemaData.some((f) => f && f.type === 'transit_end');
    if (hasStart && !hasEnd) return MSG_START_WITHOUT_END;
    return null;
}

module.exports = {
    validateChecklistTransitDisplacement,
    MSG_END_BEFORE_START,
    MSG_START_WITHOUT_END,
};
