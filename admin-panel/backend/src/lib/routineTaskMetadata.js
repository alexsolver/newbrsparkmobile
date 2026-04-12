'use strict';

function routineTaskMetadataFromTemplate(tpl, templateId, opts) {
  const override =
    opts && opts.menuLabel != null && String(opts.menuLabel).trim()
      ? String(opts.menuLabel).trim()
      : '';
  const title = override || (tpl?.title ? String(tpl.title).trim() : 'Tarefa de rotina');
  const desc =
    tpl?.description != null && String(tpl.description).trim()
      ? String(tpl.description).trim()
      : 'Formulário de rotina.';
  return {
    routineTask: true,
    refId: templateId,
    title: `${title} (RT)`,
    templateTitle: title,
    description: desc,
  };
}

module.exports = { routineTaskMetadataFromTemplate };
