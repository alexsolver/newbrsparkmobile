'use strict';

/**
 * Minutas legais v2026.04.2 — en-US, es-ES, de-DE (metadados alinhados ao array pt-BR).
 * Conteúdo equivalente ao português; revisão jurídica obrigatória antes de publicar.
 */

const { VERSION, legalDocsPtBr } = require('./compliancePtBrLegalDocs');

const BANNER = {
  'en-US': [
    '> **Draft for legal review.** This document is an operational baseline for Aria and must be reviewed by qualified counsel before publication to the public, customers, employees or contractors.',
    '',
  ].join('\n'),
  'es-ES': [
    '> **Borrador para revisión jurídica.** Este documento es una base operativa para Aria y debe ser revisado por abogado colegiado antes de su publicación al público, clientes, empleados o contratistas.',
    '',
  ].join('\n'),
  'de-DE': [
    '> **Entwurf zur juristischen Prüfung.** Dieses Dokument ist eine operative Vorlage für Aria und muss vor Veröffentlichung gegenüber Öffentlichkeit, Kunden, Arbeitnehmern oder Auftragnehmern von qualifizierten Rechtsanwälten geprüft werden.',
    '',
  ].join('\n'),
};

const FOOTER = {
  'en-US': '**Legal & privacy contact:** dpo@aria.com',
  'es-ES': '**Contacto jurídico y privacidad:** dpo@aria.com',
  'de-DE': '**Juristischer Datenschutzkontakt:** dpo@aria.com',
};

const LABEL = {
  'en-US': 'en-US',
  'es-ES': 'es-ES',
  'de-DE': 'de-DE',
};

function md(locale, title, sections) {
  const tag = LABEL[locale];
  return [
    `# ${title[locale]}`,
    '',
    `**Version ${VERSION} — ${tag}**`,
    '',
    BANNER[locale],
    ...sections.flatMap((section) => [
      `## ${section.title[locale]}`,
      '',
      ...(Array.isArray(section.body[locale]) ? section.body[locale] : [section.body[locale]]),
      '',
    ]),
    '---',
    '',
    FOOTER[locale],
  ].join('\n');
}

const commonController = {
  'en-US':
    'Aria Tecnologia Ltda., its affiliates, successors or operational entities indicated in the applicable agreement.',
  'es-ES':
    'Aria Tecnologia Ltda., sus filiales, sucesoras o entidades operativas indicadas en el contrato aplicable.',
  'de-DE':
    'Aria Tecnologia Ltda., deren verbundene Unternehmen, Rechtsnachfolger oder im Vertrag genannte Betriebseinheiten.',
};

const commonScope = {
  'en-US':
    'website, admin console, APIs, mobile app, field modules, integrations, transactional communications and related Aria platform services.',
  'es-ES':
    'sitio web, consola de administración, APIs, app móvil, módulos de campo, integraciones, comunicaciones transaccionales y servicios relacionados de la plataforma Aria.',
  'de-DE':
    'Website, Admin-Konsole, APIs, mobile App, Feldmodule, Integrationen, transaktionale Kommunikation und zugehörige Dienste der Aria-Plattform.',
};

/** @type {Array<{ type: string, titles: Record<string,string>, summaries: Record<string,string>, sections: Array<{ title: Record<string,string>, body: Record<string,string|string[]>}>}>} */
const I18N_SPECS = [
  {
    type: 'TERMS_OF_USE',
    titles: {
      'en-US': 'Aria Platform Terms of Use',
      'es-ES': 'Términos de uso de la plataforma Aria',
      'de-DE': 'Nutzungsbedingungen der Aria-Plattform',
    },
    summaries: {
      'en-US':
        'Draft consolidating multi-tenant SaaS, mobile app, admin console, plans, limits, customer data and acceptable use.',
      'es-ES':
        'Borrador consolidado para SaaS multi-tenant, app móvil, panel admin, planes, límites, datos del cliente y uso aceptable.',
      'de-DE':
        'Entwurf für Multi-Tenant-SaaS, mobile App, Admin-Konsole, Pläne, Limits, Kundendaten und akzeptable Nutzung.',
    },
    sections: [
      {
        title: {
          'en-US': '1. Identification and scope',
          'es-ES': '1. Identificación y alcance',
          'de-DE': '1. Identifikation und Geltungsbereich',
        },
        body: {
          'en-US': `These Terms govern access to and use of the Aria platform, including ${commonScope['en-US']} Subscription or continued use indicates acknowledgement and agreement to these Terms, supplementary policies and any commercial terms accepted by the Customer.`,
          'es-ES': `Estos Términos regulan el acceso y uso de la plataforma Aria, incluido ${commonScope['es-ES']} La contratación o el uso continuado implica conocimiento y aceptación de estos Términos, políticas complementarias y condiciones comerciales aceptadas por el Cliente.`,
          'de-DE': `Diese Bedingungen regeln den Zugang zur und die Nutzung der Aria-Plattform, einschließlich ${commonScope['de-DE']} Vertragsschluss oder fortgesetzte Nutzung bedeuten die Anerkennung und Zustimmung zu diesen Bedingungen, ergänzenden Richtlinien und allen vom Kunden akzeptierten kommerziellen Bedingungen.`,
        },
      },
      {
        title: {
          'en-US': '2. Key definitions',
          'es-ES': '2. Definiciones principales',
          'de-DE': '2. Wesentliche Definitionen',
        },
        body: {
          'en-US': [
            '**Aria**: the platform provider. **Customer or Tenant**: a legal entity or business account that manages users, technicians, assets, work orders and data. **User**: a person authorized by the Customer. **Contractor**: a professional invited, registered or affiliated with a tenant. **Customer Data**: content, documents, records, photos, checklists, operational data and information entered or generated through the platform.',
          ],
          'es-ES': [
            '**Aria**: proveedora de la plataforma. **Cliente o Tenant**: persona jurídica o cuenta empresarial que administra usuarios, técnicos, activos, órdenes de servicio y datos. **Usuario**: persona autorizada por el Cliente. **Contratista**: profesional invitado, registrado o afiliado a un tenant. **Datos del Cliente**: contenido, documentos, registros, fotos, checklists, datos operativos e información introducida o generada en el uso de la plataforma.',
          ],
          'de-DE': [
            '**Aria**: Anbieterin der Plattform. **Kunde oder Tenant**: juristische Person oder Geschäftskonto, das Benutzer, Techniker, Vermögenswerte, Arbeitsaufträge und Daten verwaltet. **Nutzer**: vom Kunden autorisierte Person. **Auftragnehmer**: eingeladener, registrierter oder einem Tenant zugeordneter Dienstleister. **Kundendaten**: Inhalte, Dokumente, Aufzeichnungen, Fotos, Checklisten, Betriebsdaten und Informationen, die bei Nutzung der Plattform eingegeben oder erzeugt werden.',
          ],
        },
      },
      {
        title: {
          'en-US': '3. Account, credentials and eligibility',
          'es-ES': '3. Cuenta, credenciales y elegibilidad',
          'de-DE': '3. Konto, Zugangsdaten und Berechtigung',
        },
        body: {
          'en-US':
            'The Customer must provide accurate information, keep credentials secure, assign appropriate access profiles and remove users who should no longer access the platform. Actions taken with valid credentials will be attributed to the corresponding account, except where exclusive fault of Aria is proven.',
          'es-ES':
            'El Cliente debe proporcionar datos veraces, mantener las credenciales seguras, definir perfiles de acceso adecuados y eliminar usuarios que ya no deban acceder a la plataforma. Los actos realizados con credenciales válidas se atribuirán a la cuenta correspondiente, salvo prueba de fallo exclusivo de Aria.',
          'de-DE':
            'Der Kunde muss wahre Angaben machen, Zugangsdaten schützen, angemessene Zugriffsprofile vergeben und Nutzer entfernen, die keinen Zugang mehr haben sollen. Handlungen mit gültigen Zugangsdaten werden dem jeweiligen Konto zugerechnet, sofern nicht ausschließliches Verschulden von Aria nachgewiesen wird.',
        },
      },
      {
        title: {
          'en-US': '4. Services and modules',
          'es-ES': '4. Servicios y módulos',
          'de-DE': '4. Leistungen und Module',
        },
        body: {
          'en-US':
            'Aria may offer modules for asset management, inventory, documents, checklists, work orders, location, time tracking, biometrics, AI, reports, integrations, ratings, notifications and billing. Modules may depend on the subscribed plan, permissions, technical limits, third-party availability or tenant configuration.',
          'es-ES':
            'Aria puede ofrecer módulos de gestión de activos, inventario, documentos, checklists, órdenes de servicio, ubicación, jornada, biometría, IA, informes, integraciones, evaluaciones, notificaciones y facturación. Los módulos pueden depender del plan contratado, permisos, límites técnicos, disponibilidad de terceros o configuración del tenant.',
          'de-DE':
            'Aria kann Module für Vermögensverwaltung, Bestand, Dokumente, Checklisten, Arbeitsaufträge, Standort, Zeiterfassung, Biometrie, KI, Berichte, Integrationen, Bewertungen, Benachrichtigungen und Abrechnung anbieten. Module können vom gebuchten Plan, Berechtigungen, technischen Grenzen, Drittanbieter-Verfügbarkeit oder Tenant-Konfiguration abhängen.',
        },
      },
      {
        title: {
          'en-US': '5. Plans, limits and changes',
          'es-ES': '5. Planes, límites y cambios',
          'de-DE': '5. Pläne, Limits und Änderungen',
        },
        body: {
          'en-US':
            'Plans may include limits on users, technicians, assets, storage, AI calls, maps, routines, templates, integrations and support. Aria may change future plans, preserve contracted conditions for the current cycle where applicable, and notify material changes with reasonable advance notice.',
          'es-ES':
            'Los planes pueden incluir límites de usuarios, técnicos, activos, almacenamiento, llamadas de IA, mapas, rutinas, plantillas, integraciones y soporte. Aria puede cambiar planes futuros, preservar condiciones contratadas durante el ciclo vigente cuando aplique y comunicar cambios materiales con antelación razonable.',
          'de-DE':
            'Pläne können Grenzen für Nutzer, Techniker, Vermögenswerte, Speicher, KI-Aufrufe, Karten, Routinen, Vorlagen, Integrationen und Support enthalten. Aria darf künftige Pläne ändern, vertragliche Konditionen für den laufenden Zyklus wahren, soweit anwendbar, und wesentliche Änderungen mit angemessener Vorankündigung mitteilen.',
        },
      },
      {
        title: {
          'en-US': '6. Customer obligations',
          'es-ES': '6. Obligaciones del Cliente',
          'de-DE': '6. Pflichten des Kunden',
        },
        body: {
          'en-US':
            'The Customer is responsible for obtaining legal bases, notices and authorizations needed to process data about its users, employees, contractors and end customers; configuring data collection policies; reviewing legal documents; and using the platform in compliance with labour, civil, consumer, sectoral and data protection laws.',
          'es-ES':
            'El Cliente es responsable de obtener bases legales, avisos y autorizaciones necesarias para tratar datos de sus usuarios, empleados, contratistas y clientes finales; configurar políticas de recogida de datos; revisar documentos legales; y usar la plataforma conforme a leyes laborales, civiles, de consumo, sectoriales y de protección de datos.',
          'de-DE':
            'Der Kunde ist verantwortlich für Rechtsgrundlagen, Hinweise und Einwilligungen zur Verarbeitung von Daten seiner Nutzer, Arbeitnehmer, Auftragnehmer und Endkunden; für Konfiguration von Datenerhebungsrichtlinien; für Prüfung juristischer Dokumente; und für rechtmäßige Nutzung nach Arbeits-, Zivil-, Verbraucher-, Branchen- und Datenschutzrecht.',
        },
      },
      {
        title: {
          'en-US': '7. Acceptable use',
          'es-ES': '7. Uso aceptable',
          'de-DE': '7. Zulässige Nutzung',
        },
        body: {
          'en-US':
            'You must not use the platform for unlawful purposes, violate third-party rights, bypass limits, introduce malware, attempt unauthorized access, engage in improper reverse engineering, collect data without a legal basis, use AI for discriminatory decisions, or upload illegal, offensive content or trade secrets of third parties.',
          'es-ES':
            'Está prohibido usar la plataforma con fines ilícitos, violar derechos de terceros, eludir límites, introducir malware, intentar acceso no autorizado, realizar ingeniería inversa indebida, tratar datos sin base legal, usar IA para decisiones discriminatorias o cargar contenido ilegal u ofensivo o secretos empresariales de terceros.',
          'de-DE':
            'Die Plattform darf nicht für rechtswidrige Zwecke genutzt, Rechte Dritter verletzt, Limits umgangen, Schadsoftware eingeschleust, unbefugter Zugriff versucht, unzulässig reverse-engineert, Daten ohne Rechtsgrund verarbeitet, KI für diskriminierende Entscheidungen genutzt oder rechtswidrige/offensive Inhalte oder Geschäftsgeheimnisse Dritter hochgeladen werden.',
        },
      },
      {
        title: {
          'en-US': '8. Data, ownership and operational licence',
          'es-ES': '8. Datos, propiedad y licencia operativa',
          'de-DE': '8. Daten, Eigentum und Betriebslizenz',
        },
        body: {
          'en-US':
            'Customer Data remains owned by the Customer or the respective data subjects. The Customer grants Aria a limited licence to host, process, transmit, display, analyse and protect such data solely to operate, maintain, audit, improve and support the contracted services.',
          'es-ES':
            'Los Datos del Cliente siguen siendo propiedad del Cliente o de los titulares correspondientes. El Cliente concede a Aria una licencia limitada para alojar, procesar, transmitir, mostrar, analizar y proteger dichos datos solo para operar, mantener, auditar, mejorar y dar soporte a los servicios contratados.',
          'de-DE':
            'Kundendaten verbleiben im Eigentum des Kunden oder der betroffenen Personen. Der Kunde erteilt Aria eine beschränkte Lizenz zum Hosten, Verarbeiten, Übertragen, Anzeigen, Analysieren und Schützen dieser Daten ausschließlich zum Betrieb, zur Wartung, Prüfung, Verbesserung und zum Support der beauftragten Dienste.',
        },
      },
      {
        title: {
          'en-US': '9. Integrations and third parties',
          'es-ES': '9. Integraciones y terceros',
          'de-DE': '9. Integrationen und Dritte',
        },
        body: {
          'en-US':
            'The platform may integrate cloud, maps, email, push, storage, AI, biometrics, payments, e-signature and external APIs. Aria is not liable for unavailability, changes or failures of third parties outside its reasonable control, without prejudice to contractually available mitigation.',
          'es-ES':
            'La plataforma puede integrar servicios de nube, mapas, correo, push, almacenamiento, IA, biometría, pagos, firma electrónica y APIs externas. Aria no responde por indisponibilidad, cambios o fallos de terceros fuera de su control razonable, sin perjuicio de mitigaciones contractualmente aplicables.',
          'de-DE':
            'Die Plattform kann Cloud-, Karten-, E-Mail-, Push-, Speicher-, KI-, Biometrie-, Zahlungs-, E-Signatur-Dienste und externe APIs einbinden. Aria haftet nicht für Nichtverfügbarkeit, Änderungen oder Ausfälle von Dritten außerhalb angemessener Kontrolle, vorbehaltlich vertraglicher Minderung.',
        },
      },
      {
        title: {
          'en-US': '10. Security and availability',
          'es-ES': '10. Seguridad y disponibilidad',
          'de-DE': '10. Sicherheit und Verfügbarkeit',
        },
        body: {
          'en-US':
            'Aria implements technical and organisational measures proportionate to risk and may perform maintenance, updates and preventive blocks. The Customer must govern devices, networks, users and permissions appropriately.',
          'es-ES':
            'Aria aplica medidas técnicas y organizativas proporcionales al riesgo y puede realizar mantenimientos, actualizaciones y bloqueos preventivos. El Cliente debe gobernar dispositivos, redes, usuarios y permisos adecuadamente.',
          'de-DE':
            'Aria setzt dem Risiko angemessene technische und organisatorische Maßnahmen um und kann Wartung, Updates und präventive Sperren durchführen. Der Kunde muss Geräte, Netze, Nutzer und Berechtigungen angemessen steuern.',
        },
      },
      {
        title: {
          'en-US': '11. Suspension and termination',
          'es-ES': '11. Suspensión y terminación',
          'de-DE': '11. Aussetzung und Beendigung',
        },
        body: {
          'en-US':
            'Aria may suspend access for non-payment, security risk, abuse, legal order, breach of these Terms or to protect the platform. After termination, data may be exported, retained or deleted according to contract, law and the Data Retention Policy.',
          'es-ES':
            'Aria puede suspender el acceso por impago, riesgo de seguridad, uso abusivo, orden legal, incumplimiento de estos Términos o para proteger la plataforma. Tras la terminación, los datos pueden exportarse, conservarse o eliminarse según contrato, ley y Política de Retención.',
          'de-DE':
            'Aria kann den Zugang bei Zahlungsverzug, Sicherheitsrisiko, Missbrauch, behördlicher Anordnung, Verstoß gegen diese Bedingungen oder zum Schutz der Plattform sperren. Nach Beendigung können Daten gemäß Vertrag, Gesetz und Aufbewahrungsrichtlinie exportiert, aufbewahrt oder gelöscht werden.',
        },
      },
      {
        title: {
          'en-US': '12. Limitation of liability',
          'es-ES': '12. Limitación de responsabilidad',
          'de-DE': '12. Haftungsbeschränkung',
        },
        body: {
          'en-US':
            'To the fullest extent permitted by law, Aria’s total liability is limited to amounts paid by the Customer in the 12 months preceding the event, except for wilful misconduct, intentional breach, non-waivable legal duties or specific contractual provisions.',
          'es-ES':
            'En la máxima medida permitida por la ley, la responsabilidad total de Aria se limitará a los importes pagados por el Cliente en los 12 meses anteriores al evento, salvo dolo, incumplimiento intencional, obligaciones legales inderogables o disposición contractual específica.',
          'de-DE':
            'Soweit gesetzlich zulässig, ist die Gesamthaftung von Aria auf die vom Kunden in den 12 Monaten vor dem Ereignis gezahlten Beträge begrenzt, außer bei Vorsatz, vorsätzlichem Verstoß, zwingenden gesetzlichen Pflichten oder ausdrücklichen Vertragsregelungen.',
        },
      },
      {
        title: {
          'en-US': '13. Governing law and venue',
          'es-ES': '13. Ley aplicable y fuero',
          'de-DE': '13. Anwendbares Recht und Gerichtsstand',
        },
        body: {
          'en-US':
            'These Terms are governed by the laws of the Federative Republic of Brazil. The courts of São Paulo/SP are elected, unless a specific agreement or mandatory law provides otherwise.',
          'es-ES':
            'Estos Términos se rigen por las leyes de la República Federativa del Brasil. Se eligen los tribunales de São Paulo/SP, salvo acuerdo específico o norma imperativa aplicable.',
          'de-DE':
            'Diese Bedingungen unterliegen den Gesetzen der Föderativen Republik Brasilien. Gerichtsstand ist São Paulo/SP, sofern nicht zwingendes Recht oder ein besonderer Vertrag etwas anderes vorsieht.',
        },
      },
    ],
  },
  {
    type: 'PRIVACY_POLICY',
    titles: {
      'en-US': 'Aria Privacy Policy',
      'es-ES': 'Política de privacidad Aria',
      'de-DE': 'Aria-Datenschutzerklärung',
    },
    summaries: {
      'en-US':
        'v2026.04.2 restatement: LGPD-aligned B2B roles, data categories, legal bases, cookies, transfers, retention, rights, AI/automation, incidents, ANPD contact path.',
      'es-ES':
        'v2026.04.2: replanteo alineado a la LGPD (roles B2B, categorías, bases legales, cookies, transferencias, retención, derechos, IA/automatización, incidentes, ANPD).',
      'de-DE':
        'v2026.04.2: Neufassung LGPD-orientiert (B2B-Rollen, Kategorien, Rechtsgrundlagen, Cookies, Übermittlungen, Aufbewahrung, Rechte, KI/Automatisierung, Vorfälle, ANPD).',
    },
    sections: [
      {
        title: {
          'en-US': '1. Who we are, roles and material scope',
          'es-ES': '1. Quiénes somos, roles y ámbito material',
          'de-DE': '1. Wer wir sind, Rollen und materieller Anwendungsbereich',
        },
        body: {
          'en-US': `This Policy describes how ${commonController['en-US'].replace(/\.\s*$/, '')} processes personal data in the context of ${commonScope['en-US']}

In **B2B** relationships, the **Customer (tenant)** is generally the **controller** of data relating to its users, employees, field contractors and end customers recorded or monitored through the platform. **Aria** predominantly acts as a **processor**, carrying out processing necessary to deliver the contracted service based on instructions compatible with law and console settings.

Aria may act as an **independent controller** where it processes data for **its own purposes**, such as billing, fraud prevention, information security, legal compliance, commercial relationship, product improvement in aggregated or anonymised form where feasible, and responses to authorities.`,
          'es-ES': `Esta Política describe cómo ${commonController['es-ES'].replace(/\.\s*$/, '')} realiza el tratamiento de datos personales en el marco de ${commonScope['es-ES']}

En relaciones **B2B**, por regla general el **Cliente (tenant)** es el **responsable** del tratamiento de datos relativos a sus usuarios, empleados, contratistas de campo y clientes finales registrados o supervisados en la plataforma. **Aria** actúa predominantemente como **encargado**, ejecutando tratamientos necesarios para la prestación del servicio contratado, con base en instrucciones compatibles con la ley y la configuración del panel.

Aria podrá actuar como **responsable independiente** cuando trate datos para **fines propios**, como facturación, prevención de fraudes, seguridad de la información, cumplimiento legal, relación comercial, mejora de producto de forma agregada o anonimizada cuando sea posible y respuesta a autoridades.`,
          'de-DE': `Diese Erklärung beschreibt, wie ${commonController['de-DE'].replace(/\.\s*$/, '')} personenbezogene Daten im Rahmen von ${commonScope['de-DE']} verarbeitet.

In **B2B**-Beziehungen ist der **Kunde (Tenant)** in der Regel **Verantwortlicher** für Daten zu seinen Nutzern, Arbeitnehmern, Außendienst-Auftragnehmern und Endkunden, die über die Plattform erfasst oder überwacht werden. **Aria** handelt überwiegend als **Auftragsverarbeiter** und führt Verarbeitungen durch, die zur Erbringung des vertraglich geschuldeten Dienstes erforderlich sind, gestützt auf Anweisungen, die mit dem Recht und den Konsoleneinstellungen vereinbar sind.

Aria kann **eigenständige Verantwortliche** sein, wenn sie Daten für **eigene Zwecke** verarbeitet, etwa Abrechnung, Betrugsprävention, Informationssicherheit, gesetzliche Compliance, Geschäftsbeziehung, Produktverbesserung in aggregierter oder anonymisierter Form soweit möglich sowie Beantwortung behördlicher Anfragen.`,
        },
      },
      {
        title: {
          'en-US': '2. Categories of personal data',
          'es-ES': '2. Categorías de datos personales',
          'de-DE': '2. Kategorien personenbezogener Daten',
        },
        body: {
          'en-US': [
            'Depending on subscribed modules and use of the platform, we may process the following categories, among others:',
            '- **Identification and registration:** name, email, phone, documents, company, role, account and tenant identifiers.',
            '- **Authentication and security:** credentials, session tokens, login records, IP, device type and security events.',
            '- **Field operations and assets:** work orders, checklists, signatures, photos, short videos, audio or voice notes, barcode reads, geolocation (including background where enabled), geofences, time tracking and clock events.',
            '- **Biometrics (facial):** templates or measurements **only** where the Customer enables the feature and there is a lawful basis and transparency for data subjects.',
            '- **Subscription billing data:** information required for invoicing, tax documents and plan management (via payment processors where applicable).',
            '- **Communications:** transactional, in-app, email and push notifications.',
            '- **Telemetry and diagnostics:** technical logs, failures, performance and usage metrics for reliability and support.',
            '- **AI and reporting:** inputs sent to AI features configured by the Customer and outputs displayed in the product, within product limits.',
          ],
          'es-ES': [
            'Según los módulos contratados y el uso de la plataforma, podremos tratar, entre otras, las siguientes categorías:',
            '- **Identificación y registro:** nombre, correo, teléfono, documentos, empresa, función, identificadores de cuenta y de tenant.',
            '- **Autenticación y seguridad:** credenciales, tokens de sesión, registros de acceso, IP, tipo de dispositivo y eventos de seguridad.',
            '- **Operación de campo y activos:** órdenes de servicio, checklists, firmas, fotos, videos cortos, audio o notas de voz, lecturas de código, geolocalización (incluido segundo plano si está habilitado), geocercas, jornada y fichajes.',
            '- **Biometría (facial):** plantillas o mediciones **solo** si el Cliente activa la funcionalidad y existe base legal y transparencia hacia los titulares.',
            '- **Datos financieros de suscripción:** datos necesarios para cobro, documentos fiscales y gestión de planes (vía procesadores de pago cuando aplique).',
            '- **Comunicaciones:** notificaciones transaccionales, in-app, correo y push.',
            '- **Telemetría y diagnóstico:** registros técnicos, fallos, rendimiento y métricas de uso para fiabilidad y soporte.',
            '- **IA e informes:** entradas enviadas a funciones de IA configuradas por el Cliente y resultados mostrados en el producto, dentro de los límites del producto.',
          ],
          'de-DE': [
            'Je nach gebuchten Modulen und Nutzung der Plattform können wir unter anderem folgende Kategorien verarbeiten:',
            '- **Identifikation und Registrierung:** Name, E-Mail, Telefon, Dokumente, Unternehmen, Rolle, Konto- und Tenant-Kennungen.',
            '- **Authentifizierung und Sicherheit:** Zugangsdaten, Sitzungs-Tokens, Login-Protokolle, IP, Gerätetyp und Sicherheitsereignisse.',
            '- **Außendienst und Vermögenswerte:** Arbeitsaufträge, Checklisten, Signaturen, Fotos, kurze Videos, Audio- oder Sprachnotizen, Strichcode-Reads, Geolokalisierung (einschließlich Hintergrund, falls aktiviert), Geofences, Zeiterfassung und Stempelereignisse.',
            '- **Biometrie (Gesicht):** Vorlagen oder Messwerte **nur**, wenn der Kunde die Funktion aktiviert und Rechtsgrundlage sowie Transparenz gegenüber Betroffenen bestehen.',
            '- **Abonnement-Abrechnungsdaten:** für Rechnungen, Steuerbelege und Planverwaltung erforderliche Angaben (über Zahlungsdienstleister, falls zutreffend).',
            '- **Kommunikation:** transaktionale, In-App-, E-Mail- und Push-Benachrichtigungen.',
            '- **Telemetrie und Diagnose:** technische Protokolle, Ausfälle, Leistung und Nutzungsmetriken für Zuverlässigkeit und Support.',
            '- **KI und Berichte:** Eingaben an vom Kunden konfigurierte KI-Funktionen und im Produkt angezeigte Ergebnisse, innerhalb der Produktgrenzen.',
          ],
        },
      },
      {
        title: {
          'en-US': '3. Sensitive data and occupational health',
          'es-ES': '3. Datos sensibles y salud ocupacional',
          'de-DE': '3. Besondere Daten und arbeitsmedizinische / Arbeitssicherheitsaspekte',
        },
        body: {
          'en-US':
            'Certain forms or flows may capture **sensitive data** (including, in some scenarios, health or occupational safety data) **by decision and configuration of the Customer**. In those cases the Customer is responsible for informing data subjects, applying applicable legal bases (including LGPD Art. 11 hypotheses), minimisation and retention periods. Aria restricts internal access to what is strictly necessary and enforces logical segregation between tenants.',
          'es-ES':
            'Determinados formularios o flujos pueden capturar **datos sensibles** (incluidos, en algunos escenarios, datos de salud o seguridad ocupacional) **por decisión y configuración del Cliente**. En esos casos, el Cliente es responsable de informar a los titulares, aplicar bases legales aplicables (incluidas hipótesis del art. 11 de la LGPD), minimización y plazos de retención. Aria limita el acceso interno a lo estrictamente necesario y exige segregación lógica entre tenants.',
          'de-DE':
            'Bestimmte Formulare oder Abläufe können **besonders schützenswerte Daten** (einschließlich Gesundheits- oder Arbeitssicherheitsdaten in einigen Szenarien) **auf Entscheidung und Konfiguration des Kunden** erfassen. In diesen Fällen informiert der Kunde Betroffene, wendet anwendbare Rechtsgrundlagen (einschließlich Tatbestände des Art. 11 LGPD) an und setzt Minimierung und Aufbewahrungsfristen um. Aria beschränkt internen Zugriff auf das strikt Erforderliche und setzt logische Mandantentrennung durch.',
        },
      },
      {
        title: {
          'en-US': '4. Purposes of processing',
          'es-ES': '4. Finalidades del tratamiento',
          'de-DE': '4. Zwecke der Verarbeitung',
        },
        body: {
          'en-US':
            'We process data to provision and operate the platform; authenticate users; synchronise offline data; evidence service execution; prevent fraud and abuse; send operational communications; provide support; perform contracts; invoice; comply with legal or regulatory orders; conduct audits and defend rights; improve performance, stability and security; and, where applicable, enable location, biometrics, AI and integrations authorised by the Customer.',
          'es-ES':
            'Tratamos datos para aprovisionar y operar la plataforma; autenticar usuarios; sincronizar datos offline; acreditar la ejecución de servicios; prevenir fraudes y abusos; enviar comunicaciones operacionales; prestar soporte; ejecutar contratos; facturar; cumplir órdenes legales o regulatorias; auditar y defender derechos; mejorar rendimiento, estabilidad y seguridad; y, cuando aplique, habilitar localización, biometría, IA e integraciones autorizadas por el Cliente.',
          'de-DE':
            'Wir verarbeiten Daten zur Bereitstellung und zum Betrieb der Plattform; zur Authentifizierung; zur Offline-Synchronisierung; zum Nachweis der Leistungserbringung; zur Betrugs- und Missbrauchsprävention; zu transaktionalen Mitteilungen; zum Support; zur Vertragserfüllung; zur Rechnungsstellung; zur Erfüllung behördlicher oder regulatorischer Anforderungen; zu Prüfungen und Rechtsverteidigung; zur Verbesserung von Leistung, Stabilität und Sicherheit; sowie gegebenenfalls zur Aktivierung von Standort, Biometrie, KI und vom Kunden autorisierten Integrationen.',
        },
      },
      {
        title: {
          'en-US': '5. Legal bases (LGPD and equivalents)',
          'es-ES': '5. Bases legales (LGPD y equivalencias)',
          'de-DE': '5. Rechtsgrundlagen (LGPD und Entsprechungen)',
        },
        body: {
          'en-US':
            'Depending on role (controller/processor) and context, LGPD Art. 7 hypotheses may apply, including contract performance; legal obligation; regular exercise of rights; protection of life; health protection; legitimate interests (with balancing); credit protection; and consent where required. For **sensitive data**, LGPD Art. 11 applies. Where data subjects are in the European Union, GDPR bases may apply complementarily without prejudice to Brazilian law governing the agreement.',
          'es-ES':
            'Según el papel (responsable/encargado) y el contexto, pueden aplicarse hipótesis del art. 7º de la LGPD, incluidas ejecución de contrato; obligación legal; ejercicio regular de derechos; protección de la vida; tutela de la salud; interés legítimo (con balance); protección al crédito; y consentimiento cuando sea exigido. Para **datos sensibles**, aplica el art. 11º de la LGPD. Si hay titulares en la Unión Europea, pueden aplicarse bases del RGPD de forma complementaria, sin perjuicio de la ley brasileña aplicable al contrato.',
          'de-DE':
            'Je nach Rolle (Verantwortlicher/Auftragsverarbeiter) und Kontext können Tatbestände des Art. 7 LGPD gelten, einschließlich Vertragserfüllung; gesetzliche Verpflichtung; regelmäßige Rechtsausübung; Lebensschutz; Gesundheitsschutz; berechtigtes Interesse (mit Interessenabwägung); Kreditwürdigkeit; und Einwilligung, wenn erforderlich. Für **besondere Datenkategorien** gilt Art. 11 LGPD. Für Betroffene in der Europäischen Union können GDPR-Grundlagen ergänzend gelten, unbeschadet des auf den Vertrag anwendbaren brasilianischen Rechts.',
        },
      },
      {
        title: {
          'en-US': '6. Cookies and similar technologies',
          'es-ES': '6. Cookies y tecnologías similares',
          'de-DE': '6. Cookies und ähnliche Technologien',
        },
        body: {
          'en-US':
            'Websites and web apps may use cookies, local storage and similar technologies as described in the separate **Cookie Policy**. Non-essential cookies follow consent settings available in the public interface or onboarding flow, as implemented.',
          'es-ES':
            'Los sitios y aplicaciones web pueden usar cookies, almacenamiento local y tecnologías similares según la **Política de Cookies** publicada aparte. Las cookies no estrictamente necesarias siguen la configuración de consentimiento disponible en la interfaz pública o en el flujo de onboarding, según implementación.',
          'de-DE':
            'Websites und Web-Apps können Cookies, Local Storage und ähnliche Technologien gemäß der separaten **Cookie-Richtlinie** einsetzen. Nicht unbedingt erforderliche Cookies folgen den Einwilligungseinstellungen der öffentlichen Oberfläche oder des Onboardings, soweit implementiert.',
        },
      },
      {
        title: {
          'en-US': '7. Recipients, sharing and subprocessors',
          'es-ES': '7. Destinatarios, cesiones y suboperadores',
          'de-DE': '7. Empfänger, Weitergabe und Subprozessoren',
        },
        body: {
          'en-US':
            'We may share data with **subprocessors** and suppliers that support infrastructure (cloud, database, CDN), maps, push notifications, email, object storage, payments, e-signature, biometrics (when enabled), AI, observability and support. We require data-protection clauses and segregation. We **do not sell** personal data in the sense of a commercial sale for independent third-party marketing. We may disclose data to **authorities** pursuant to valid legal process or to defend rights in proceedings.',
          'es-ES':
            'Podemos compartir datos con **suboperadores** y proveedores que apoyan infraestructura (nube, base de datos, CDN), mapas, notificaciones push, correo, almacenamiento de objetos, pagos, firma electrónica, biometría (si está habilitada), IA, observabilidad y soporte. Exigimos cláusulas de protección de datos y segregación. **No vendemos** datos personales en el sentido de venta onerosa para marketing independiente de terceros. Podemos revelar datos a **autoridades** por proceso legal válido o para defensa de derechos en procedimiento.',
          'de-DE':
            'Wir können Daten mit **Subprozessoren** und Lieferanten teilen, die Infrastruktur (Cloud, Datenbank, CDN), Karten, Push, E-Mail, Objektspeicher, Zahlungen, E-Signatur, Biometrie (falls aktiviert), KI, Observability und Support ermöglichen. Wir verlangen Datenschutzklauseln und Trennung. Wir **verkaufen** keine personenbezogenen Daten im Sinne eines entgeltlichen Verkaufs für eigenständiges Drittanbieter-Marketing. Wir können Daten gegenüber **Behörden** aufgrund gültiger rechtlicher Verfahren oder zur Rechtsverteidigung offenlegen.',
        },
      },
      {
        title: {
          'en-US': '8. International transfers',
          'es-ES': '8. Transferencias internacionales',
          'de-DE': '8. Internationale Übermittlungen',
        },
        body: {
          'en-US':
            'Part of our infrastructure or subprocessors may be located **outside Brazil**. Where international transfers occur, we adopt instruments and measures compatible with the LGPD (including standard clauses, risk assessment and technical safeguards). Where the GDPR applies, we observe equivalent transfer requirements.',
          'es-ES':
            'Parte de la infraestructura o suboperadores puede estar **fuera de Brasil**. Cuando haya transferencia internacional, adoptamos instrumentos y medidas compatibles con la LGPD (incluidas cláusulas tipo, evaluación de riesgo y garantías técnicas). Cuando aplique el RGPD, observamos requisitos equivalentes de transferencia.',
          'de-DE':
            'Teile der Infrastruktur oder Subprozessoren können **außerhalb Brasiliens** stehen. Bei internationalen Übermittlungen setzen wir Instrumente und Maßnahmen um, die mit der LGPD vereinbar sind (einschließlich Standardklauseln, Risikobewertung und technischer Garantien). Wo die DSGVO gilt, beachten wir gleichwertige Übermittlungsanforderungen.',
        },
      },
      {
        title: {
          'en-US': '9. Retention and deletion',
          'es-ES': '9. Retención y eliminación',
          'de-DE': '9. Aufbewahrung und Löschung',
        },
        body: {
          'en-US':
            'We retain data for as long as necessary for the purposes described, legal obligations, dispute resolution and defence of rights. Specific periods by category (e.g. raw location telemetry vs. legal evidence) are set out in the **Data Retention Policy**. Upon contract termination we will delete, anonymise or return data according to the agreement and the Customer’s documented instructions, subject to legal exceptions.',
          'es-ES':
            'Conservamos datos el tiempo necesario para las finalidades descritas, obligaciones legales, resolución de litigios y defensa de derechos. Los plazos específicos por categoría (p. ej., telemetría bruta de ubicación vs. evidencias legales) figuran en la **Política de Retención de Datos**. Al terminar el contrato, procederemos a la eliminación, anonimización o devolución según el acuerdo e instrucciones documentadas del Cliente, con salvedad de excepciones legales.',
          'de-DE':
            'Wir bewahren Daten so lange auf, wie es für die beschriebenen Zwecke, gesetzliche Pflichten, Streitbeilegung und Rechtsverteidigung erforderlich ist. Spezifische Fristen je Kategorie (z. B. Roh-Standorttelemetrie vs. Beweismittel) sind in der **Aufbewahrungsrichtlinie** geregelt. Nach Vertragsende löschen, anonymisieren oder geben wir Daten gemäß Vereinbarung und dokumentierten Weisungen des Kunden zurück, vorbehaltlich gesetzlicher Ausnahmen.',
        },
      },
      {
        title: {
          'en-US': '10. Data subject rights and contact channels',
          'es-ES': '10. Derechos de los titulares y canales de contacto',
          'de-DE': '10. Rechte der Betroffenen und Kontaktwege',
        },
        body: {
          'en-US':
            'Under the LGPD, data subjects may request confirmation of processing, access, correction, anonymisation, blocking or deletion, portability (where applicable), information on sharing, information on the possibility of not providing consent and consequences, withdrawal of consent and review of automated decisions (where applicable). In **B2B** contexts many requests must be handled by the **Customer controller**; Aria will provide reasonable assistance to the Customer within legal timeframes. Aria channel: **dpo@aria.com**. Data subjects may also contact the **Brazilian National Data Protection Authority (ANPD)** as provided by law.',
          'es-ES':
            'Conforme a la LGPD, los titulares pueden solicitar confirmación de tratamiento, acceso, rectificación, anonimización, bloqueo o eliminación, portabilidad (cuando proceda), información sobre comparticiones, información sobre la posibilidad de no otorgar consentimiento y sus consecuencias, revocación del consentimiento y revisión de decisiones automatizadas (cuando corresponda). En contexto **B2B**, muchas solicitudes deben ser atendidas por el **Cliente responsable**; Aria prestará apoyo razonable al Cliente dentro de los plazos legales. Canal Aria: **dpo@aria.com**. Los titulares también pueden contactar a la **Autoridad Nacional de Protección de Datos (ANPD)** según la ley.',
          'de-DE':
            'Nach LGPD können Betroffene Bestätigung der Verarbeitung, Auskunft, Berichtigung, Anonymisierung, Sperrung oder Löschung, Datenübertragbarkeit (soweit anwendbar), Auskunft über Weitergaben, Information über die Möglichkeit, keine Einwilligung zu erteilen, und deren Folgen, Widerruf der Einwilligung und Prüfung automatisierter Entscheidungen (soweit anwendbar) verlangen. In **B2B**-Kontexten bearbeitet viele Anfragen der **Kunde als Verantwortlicher**; Aria leistet angemessene Unterstützung innerhalb gesetzlicher Fristen. Aria-Kanal: **dpo@aria.com**. Betroffene können sich auch an die **nationale Datenschutzbehörde Brasiliens (ANPD)** wenden, wie das Gesetz vorsieht.',
        },
      },
      {
        title: {
          'en-US': '11. Security and incidents',
          'es-ES': '11. Seguridad e incidentes',
          'de-DE': '11. Sicherheit und Vorfälle',
        },
        body: {
          'en-US':
            'We implement risk-proportionate technical and organisational measures, including logical tenant segregation, access controls, event logging, encryption in transit, secure development practices, backups and monitoring. Should a relevant incident involving Customer data occur, we will notify the Customer as required by law and contract, with reasonably available information to support the controller’s duties towards data subjects and authorities.',
          'es-ES':
            'Implementamos medidas técnicas y organizativas proporcionales al riesgo, incluida segregación lógica por tenant, controles de acceso, registro de eventos, cifrado en tránsito, prácticas de desarrollo seguro, copias de seguridad y monitorización. Si ocurre un incidente relevante que involucre datos del Cliente, notificaremos al Cliente según ley y contrato, con información razonablemente disponible para apoyar las obligaciones del responsable frente a titulares y autoridades.',
          'de-DE':
            'Wir setzen risikoangemessene technische und organisatorische Maßnahmen um, einschließlich logischer Mandantentrennung, Zugriffskontrollen, Ereignisprotokollierung, Verschlüsselung während der Übertragung, sicherer Entwicklungspraxis, Backups und Monitoring. Tritt ein relevanter Vorfall mit Kundendaten ein, benachrichtigen wir den Kunden gemäß Gesetz und Vertrag mit zumutbar verfügbaren Informationen zur Unterstützung der Pflichten des Verantwortlichen gegenüber Betroffenen und Behörden.',
        },
      },
      {
        title: {
          'en-US': '12. Automated processing, profiling and AI',
          'es-ES': '12. Tratamiento automatizado, perfilado e IA',
          'de-DE': '12. Automatisierte Verarbeitung, Profiling und KI',
        },
        body: {
          'en-US':
            'AI or automated rules may suggest routes, pre-fill fields, classify operational risk or assist triage, **depending on product configuration**. Decisions producing legal or similarly significant effects will observe applicable safeguards, including transparency and, where required, human review or high-level information on logic. The Customer must assess impacts on its employees, contractors and end customers when enabling such features.',
          'es-ES':
            'La IA o reglas automatizadas pueden sugerir rutas, pre-rellenar campos, clasificar riesgo operativo o ayudar en la triage, **según configuración del producto**. Las decisiones con efecto jurídico o equivalente significativo observarán las salvaguardas legales aplicables, incluida transparencia y, cuando se exija, revisión humana o información de alto nivel sobre la lógica. El Cliente debe evaluar impactos en sus empleados, contratistas y clientes finales al habilitar tales funciones.',
          'de-DE':
            'KI oder automatisierte Regeln können Routen vorschlagen, Felder vorbefüllen, operatives Risiko klassifizieren oder bei der Triagierung helfen, **je nach Produktkonfiguration**. Entscheidungen mit rechtlicher oder vergleichbarer erheblicher Wirkung beachten anwendbare Schutzmaßnahmen, einschließlich Transparenz und gegebenenfalls menschlicher Prüfung oder Informationen zur Logik auf hoher Ebene. Der Kunde hat Auswirkungen auf Arbeitnehmer, Auftragnehmer und Endkunden zu prüfen, wenn er solche Funktionen aktiviert.',
        },
      },
      {
        title: {
          'en-US': '13. Children and adolescents',
          'es-ES': '13. Niños y adolescentes',
          'de-DE': '13. Kinder und Jugendliche',
        },
        body: {
          'en-US':
            'The platform is **not intended** for children under 16 as a target audience. Customers must not register minors’ data without a specific legal basis, assisted consent where required and appropriate internal policies.',
          'es-ES':
            'La plataforma **no está dirigida** a menores de 16 años como público objetivo. Los Clientes no deben registrar datos de menores sin base legal específica, consentimiento asistido cuando se exija y políticas internas adecuadas.',
          'de-DE':
            'Die Plattform **richtet sich nicht** an Kinder unter 16 Jahren als Zielgruppe. Kunden dürfen Daten Minderjähriger nicht ohne spezifische Rechtsgrundlage, gegebenenfalls einwilligungsunterstützte Verfahren und angemessene interne Richtlinien erfassen.',
        },
      },
      {
        title: {
          'en-US': '14. Changes to this Policy',
          'es-ES': '14. Cambios de esta Política',
          'de-DE': '14. Änderungen dieser Erklärung',
        },
        body: {
          'en-US':
            'We may update this Policy to reflect legal, product or risk changes. **Material** changes will be communicated by reasonable means (including console, institutional email or in-app consent flows). Published versions may require recorded acceptance where the nature of the change so requires, according to the environment’s compliance settings.',
          'es-ES':
            'Podemos actualizar esta Política para reflejar cambios legales, de producto o de riesgo. Los cambios **relevantes** se comunicarán por medios razonables (incluido panel, correo institucional o flujos de consentimiento en la app). Las versiones publicadas podrán exigir registro de aceptación cuando la naturaleza del cambio lo exija, según la configuración de compliance del entorno.',
          'de-DE':
            'Wir können diese Erklärung anpassen, um rechtliche, produkt- oder risikobezogene Änderungen abzubilden. **Wesentliche** Änderungen teilen wir angemessen mit (einschließlich Konsole, institutioneller E-Mail oder In-App-Einwilligungsflüssen). Veröffentlichte Versionen können dokumentierte Zustimmung erfordern, wenn die Art der Änderung dies erfordert, gemäß den Compliance-Einstellungen der Umgebung.',
        },
      },
    ],
  },
  {
    type: 'LGPD_DPA',
    titles: {
      'en-US': 'Data Processing Agreement (DPA)',
      'es-ES': 'Acuerdo de tratamiento de datos personales (DPA)',
      'de-DE': 'Auftragsverarbeitungsvertrag (AV-Vertrag / DPA)',
    },
    summaries: {
      'en-US':
        'B2B DPA draft with Aria as processor, including subprocessors, incidents, audit and termination.',
      'es-ES':
        'Borrador de DPA B2B con Aria como encargado, incluyendo suboperadores, incidentes, auditoría y terminación.',
      'de-DE':
        'B2B-AVV-Entwurf mit Aria als Auftragsverarbeiter, inkl. Subprozessoren, Vorfällen, Prüfung und Beendigung.',
    },
    sections: [
      {
        title: { 'en-US': '1. Subject matter', 'es-ES': '1. Objeto', 'de-DE': '1. Gegenstand' },
        body: {
          'en-US':
            'This Data Processing Agreement (“DPA”) supplements the agreement between Aria and the Customer and governs processing of personal data that Aria performs on behalf of the Customer as a processor under the LGPD and, where applicable, concepts aligned with GDPR Article 28.',
          'es-ES':
            'Este Acuerdo de tratamiento de datos (“DPA”) complementa el contrato entre Aria y el Cliente y regula el tratamiento de datos personales que Aria realiza por cuenta del Cliente como encargado, conforme a la LGPD y, cuando aplique, conceptos alineados con el art. 28 del RGPD.',
          'de-DE':
            'Dieser Auftragsverarbeitungsvertrag („AVV“) ergänzt die Vereinbarung zwischen Aria und dem Kunden und regelt die Verarbeitung personenbezogener Daten, die Aria im Auftrag des Kunden als Auftragsverarbeiter unter der LGPD und – soweit anwendbar – in Anlehnung an Art. 28 DSGVO vornimmt.',
        },
      },
      {
        title: { 'en-US': '2. Roles of the parties', 'es-ES': '2. Papeles de las partes', 'de-DE': '2. Rollen der Parteien' },
        body: {
          'en-US':
            'The Customer is the controller for data relating to its users, employees, contractors, end customers and other data subjects recorded in the platform. Aria is a processor when it processes such data under the Customer’s instructions. Aria may act as an independent controller for administrative, billing, security, legal compliance and commercial relationship data.',
          'es-ES':
            'El Cliente es responsable del tratamiento de los datos relativos a sus usuarios, empleados, contratistas, clientes finales y demás titulares registrados en la plataforma. Aria es encargada cuando trata dichos datos según instrucciones del Cliente. Aria puede ser responsable independiente para datos administrativos, facturación, seguridad, cumplimiento legal y relación comercial.',
          'de-DE':
            'Der Kunde ist Verantwortlicher für Daten zu seinen Nutzern, Arbeitnehmern, Auftragnehmern, Endkunden und sonstigen in der Plattform erfassten Betroffenen. Aria ist Auftragsverarbeiter, wenn sie diese Daten nach Weisung des Kunden verarbeitet. Aria kann eigenständige Verantwortliche für administrative, Abrechnungs-, Sicherheits-, Compliance- und Geschäftsbeziehungsdaten sein.',
        },
      },
      {
        title: { 'en-US': '3. Documented instructions', 'es-ES': '3. Instrucciones documentadas', 'de-DE': '3. Dokumentierte Weisungen' },
        body: {
          'en-US':
            'Aria will process data in accordance with the agreement, tenant settings, published policies, documented Customer instructions and legal obligations. If an instruction appears to violate applicable law, Aria may alert the Customer or suspend execution until clarified.',
          'es-ES':
            'Aria tratará los datos conforme al contrato, configuración del tenant, políticas publicadas, instrucciones documentadas del Cliente y obligaciones legales. Si una instrucción parece violar la ley aplicable, Aria podrá alertar al Cliente o suspender la ejecución hasta aclararlo.',
          'de-DE':
            'Aria verarbeitet Daten gemäß Vertrag, Tenant-Einstellungen, veröffentlichten Richtlinien, dokumentierten Weisungen des Kunden und gesetzlichen Pflichten. Erscheint eine Weisung rechtswidrig, kann Aria den Kunden informieren oder die Ausführung bis zur Klärung aussetzen.',
        },
      },
      {
        title: { 'en-US': '4. Categories of data and data subjects', 'es-ES': '4. Categorías de datos y titulares', 'de-DE': '4. Datenkategorien und betroffene Personen' },
        body: {
          'en-US':
            'Categories may include registration, contact, credentials, documents, photos, location, telemetry, time-tracking records, biometrics, checklists, work orders, ratings, logs, device data and professional data of users, technicians, contractors, admins, end customers and commercial contacts.',
          'es-ES':
            'Las categorías pueden incluir registro, contacto, credenciales, documentos, fotos, ubicación, telemetría, registros de jornada, biometría, checklists, órdenes de servicio, evaluaciones, registros, datos de dispositivo y datos profesionales de usuarios, técnicos, contratistas, administradores, clientes finales y contactos comerciales.',
          'de-DE':
            'Kategorien können Registrierungs-, Kontakt-, Zugangs-, Dokumenten-, Foto-, Standort-, Telemetrie-, Zeiterfassungs-, Biometrie-, Checklisten-, Auftrags-, Bewertungs-, Protokoll-, Geräte- und Berufsdaten von Nutzern, Technikern, Auftragnehmern, Administratoren, Endkunden und Geschäftskontakten umfassen.',
        },
      },
      {
        title: { 'en-US': '5. Security measures', 'es-ES': '5. Medidas de seguridad', 'de-DE': '5. Sicherheitsmaßnahmen' },
        body: {
          'en-US':
            'Aria maintains technical and organisational measures proportionate to risk, including access controls, logical tenant segregation, logs, backups, encryption in transit, incident handling and restriction of internal access on a need-to-know basis.',
          'es-ES':
            'Aria mantiene medidas técnicas y organizativas proporcionales al riesgo, incluidos controles de acceso, segregación lógica por tenant, registros, copias de seguridad, cifrado en tránsito, gestión de incidentes y restricción de acceso interno según necesidad.',
          'de-DE':
            'Aria unterhält dem Risiko angemessene technische und organisatorische Maßnahmen, einschließlich Zugriffskontrollen, logischer Mandantentrennung, Protokollen, Backups, Verschlüsselung während der Übertragung, Incident-Management und eingeschränktem internen Zugriff nach Need-to-know.',
        },
      },
      {
        title: { 'en-US': '6. Subprocessors', 'es-ES': '6. Suboperadores', 'de-DE': '6. Subprozessoren' },
        body: {
          'en-US':
            'The Customer authorises use of subprocessors necessary to deliver the services, including infrastructure, cloud, maps, AI, biometrics, email, push, payments, e-signature and observability providers. Aria will maintain a subprocessor list and require compatible data protection obligations.',
          'es-ES':
            'El Cliente autoriza el uso de suboperadores necesarios para prestar los servicios, incluidos proveedores de infraestructura, nube, mapas, IA, biometría, correo, push, pagos, firma electrónica y observabilidad. Aria mantendrá una lista de suboperadores y exigirá obligaciones compatibles de protección de datos.',
          'de-DE':
            'Der Kunde erlaubt den Einsatz erforderlicher Subprozessoren zur Erbringung der Dienste, einschließlich Infrastruktur-, Cloud-, Karten-, KI-, Biometrie-, E-Mail-, Push-, Zahlungs-, E-Signatur- und Observability-Anbietern. Aria führt eine Subprozessorliste und verlangt vereinbare Datenschutzpflichten.',
        },
      },
      {
        title: { 'en-US': '7. International transfers', 'es-ES': '7. Transferencias internacionales', 'de-DE': '7. Internationale Übermittlungen' },
        body: {
          'en-US':
            'Where subprocessors are located outside Brazil, Aria will adopt appropriate transfer mechanisms, contractual clauses, security controls and risk assessments compatible with LGPD and, where applicable, GDPR.',
          'es-ES':
            'Cuando los suboperadores estén fuera de Brasil, Aria adoptará mecanismos adecuados de transferencia, cláusulas contractuales, controles de seguridad y evaluación de riesgos compatibles con la LGPD y, cuando aplique, el RGPD.',
          'de-DE':
            'Befinden sich Subprozessoren außerhalb Brasiliens, setzt Aria angemessene Übermittlungsmechanismen, Vertragsklauseln, Sicherheitskontrollen und Risikobewertungen um, die LGPD und gegebenenfalls DSGVO entsprechen.',
        },
      },
      {
        title: { 'en-US': '8. Security incidents', 'es-ES': '8. Incidentes de seguridad', 'de-DE': '8. Sicherheitsvorfälle' },
        body: {
          'en-US':
            'Aria will notify the Customer without undue delay after becoming aware of a security incident likely to materially affect data subjects, providing reasonably available information to support assessment and response.',
          'es-ES':
            'Aria notificará al Cliente sin demora indebida tras tener conocimiento de un incidente de seguridad que pueda afectar materialmente a los titulares, proporcionando información razonablemente disponible para evaluación y respuesta.',
          'de-DE':
            'Aria informiert den Kunden unverzüglich, nachdem ihr ein Sicherheitsvorfall bekannt wird, der voraussichtlich erhebliche Auswirkungen auf Betroffene haben kann, und stellt zumutbar verfügbare Informationen zur Bewertung und Reaktion bereit.',
        },
      },
      {
        title: { 'en-US': '9. Data subjects and authorities', 'es-ES': '9. Titulares y autoridades', 'de-DE': '9. Betroffene und Behörden' },
        body: {
          'en-US':
            'Aria will assist the Customer, in a reasonable manner and as agreed, with data subject requests and authority enquiries. Requests received directly by Aria in a B2B context may be forwarded to the Customer as controller.',
          'es-ES':
            'Aria auxiliará al Cliente, de forma razonable y según lo acordado, en solicitudes de titulares y requerimientos de autoridades. Las solicitudes recibidas directamente por Aria en contexto B2B podrán remitirse al Cliente como responsable.',
          'de-DE':
            'Aria unterstützt den Kunden in angemessenem Umfang und gemäß Vereinbarung bei Betroffenenanfragen und behördlichen Anfragen. In B2B-Kontexten können direkt an Aria gerichtete Anfragen an den Kunden als Verantwortlichen weitergeleitet werden.',
        },
      },
      {
        title: { 'en-US': '10. Deletion, return and retention', 'es-ES': '10. Eliminación, devolución y retención', 'de-DE': '10. Löschung, Rückgabe und Aufbewahrung' },
        body: {
          'en-US':
            'Upon termination, Aria will delete, anonymise or return data in accordance with Customer instructions, the agreement, the Data Retention Policy and legal obligations or legitimate defence needs.',
          'es-ES':
            'Al término, Aria eliminará, anonimizará o devolverá los datos conforme a instrucciones del Cliente, contrato, Política de Retención y obligaciones legales o defensa de derechos.',
          'de-DE':
            'Nach Vertragsende löscht, anonymisiert oder gibt Aria Daten gemäß Weisungen des Kunden, Vertrag, Aufbewahrungsrichtlinie sowie gesetzlichen Pflichten oder berechtigter Rechtsverteidigung zurück.',
        },
      },
      {
        title: { 'en-US': '11. Audit', 'es-ES': '11. Auditoría', 'de-DE': '11. Prüfung (Audit)' },
        body: {
          'en-US':
            'Upon reasonable request, confidentiality and operational limits, Aria may provide information, reports, evidence or security questionnaires to demonstrate compliance.',
          'es-ES':
            'Mediante solicitud razonable, confidencialidad y límites operativos, Aria podrá proporcionar información, informes, evidencias o cuestionarios de seguridad para demostrar el cumplimiento.',
          'de-DE':
            'Auf angemessene Anfrage unter Wahrung von Vertraulichkeit und betrieblichen Grenzen kann Aria Informationen, Berichte, Nachweise oder Sicherheitsfragebögen zur Nachweisführung bereitstellen.',
        },
      },
      {
        title: { 'en-US': '12. Precedence', 'es-ES': '12. Prevalencia', 'de-DE': '12. Vorrang' },
        body: {
          'en-US':
            'If this DPA conflicts with other documents, the provision offering greater protection to personal data prevails, unless mandatory law or a specific contract clause requires otherwise.',
          'es-ES':
            'Si este DPA entra en conflicto con otros documentos, prevalecerá la disposición que ofrezca mayor protección a los datos personales, salvo ley imperativa o cláusula contractual específica.',
          'de-DE':
            'Bei Widerspruch zwischen diesem AVV und anderen Dokumenten geht die Regelung mit dem höheren Schutzniveau für personenbezogene Daten vor, sofern nicht zwingendes Recht oder eine ausdrückliche Vertragsklausel etwas anderes vorschreibt.',
        },
      },
    ],
  },
  {
    type: 'COOKIE_POLICY',
    titles: {
      'en-US': 'Cookie and Similar Technologies Policy',
      'es-ES': 'Política de cookies y tecnologías similares',
      'de-DE': 'Richtlinie zu Cookies und ähnlichen Technologien',
    },
    summaries: {
      'en-US': 'Draft for cookie banner and preference centre: necessary, analytics, preferences and marketing categories.',
      'es-ES':
        'Borrador para banner de cookies y centro de preferencias: categorías necesarias, analítica, preferencias y marketing.',
      'de-DE':
        'Entwurf für Cookie-Banner und Präferenzzentrum: notwendige, Analyse-, Präferenz- und Marketingkategorien.',
    },
    sections: [
      {
        title: { 'en-US': '1. Scope', 'es-ES': '1. Alcance', 'de-DE': '1. Geltungsbereich' },
        body: {
          'en-US':
            'This Policy explains the use of cookies, localStorage, sessionStorage, pixels, SDKs and similar technologies on Aria websites, admin console and web interfaces.',
          'es-ES':
            'Esta Política explica el uso de cookies, localStorage, sessionStorage, píxeles, SDKs y tecnologías similares en el sitio web, panel administrativo e interfaces web de Aria.',
          'de-DE':
            'Diese Richtlinie erläutert den Einsatz von Cookies, localStorage, sessionStorage, Pixeln, SDKs und ähnlichen Technologien auf Aria-Websites, der Admin-Konsole und Web-Oberflächen.',
        },
      },
      {
        title: { 'en-US': '2. What cookies are', 'es-ES': '2. Qué son las cookies', 'de-DE': '2. Was Cookies sind' },
        body: {
          'en-US':
            'Cookies are small files or identifiers stored in the browser to recognise sessions, remember preferences, protect accounts, measure usage and improve experience.',
          'es-ES':
            'Las cookies son pequeños archivos o identificadores almacenados en el navegador para reconocer sesiones, recordar preferencias, proteger cuentas, medir el uso y mejorar la experiencia.',
          'de-DE':
            'Cookies sind kleine Dateien oder Kennungen im Browser, um Sitzungen zu erkennen, Einstellungen zu speichern, Konten zu schützen, Nutzung zu messen und die Erfahrung zu verbessern.',
        },
      },
      {
        title: { 'en-US': '3. Categories', 'es-ES': '3. Categorías', 'de-DE': '3. Kategorien' },
        body: {
          'en-US': [
            '**Strictly necessary:** authentication, security, session and basic operation. **Preferences:** language, region, theme and settings. **Analytics:** aggregated usage and performance metrics. **Marketing:** campaigns and commercial measurement when enabled.',
          ],
          'es-ES': [
            '**Necesarias:** autenticación, seguridad, sesión y funcionamiento básico. **Preferencias:** idioma, región, tema y ajustes. **Analítica:** métricas agregadas de uso y rendimiento. **Marketing:** campañas y medición comercial cuando estén habilitadas.',
          ],
          'de-DE': [
            '**Unbedingt erforderlich:** Authentifizierung, Sicherheit, Sitzung und Grundbetrieb. **Einstellungen:** Sprache, Region, Theme und Konfiguration. **Analyse:** aggregierte Nutzungs- und Performancemetriken. **Marketing:** Kampagnen und kommerzielle Messung, sofern aktiviert.',
          ],
        },
      },
      {
        title: { 'en-US': '4. Legal basis and consent', 'es-ES': '4. Base legal y consentimiento', 'de-DE': '4. Rechtsgrundlage und Einwilligung' },
        body: {
          'en-US':
            'Strictly necessary cookies may rely on service provision and security. Non-essential cookies should rely on consent or another applicable legal basis, with options to accept, reject or adjust preferences.',
          'es-ES':
            'Las cookies estrictamente necesarias pueden basarse en la prestación del servicio y la seguridad. Las no esenciales deben basarse en consentimiento u otra base legal aplicable, con opción de aceptar, rechazar o ajustar preferencias.',
          'de-DE':
            'Unbedingt erforderliche Cookies können auf Vertragserfüllung und Sicherheit gestützt werden. Nicht wesentliche Cookies sollten auf Einwilligung oder eine andere anwendbare Rechtsgrundlage gestützt werden, mit Optionen zum Akzeptieren, Ablehnen oder Anpassen.',
        },
      },
      {
        title: { 'en-US': '5. Managing preferences', 'es-ES': '5. Gestión de preferencias', 'de-DE': '5. Verwaltung von Einstellungen' },
        body: {
          'en-US':
            'Users may manage preferences via the banner or settings provided. Browser-level blocking may affect essential features.',
          'es-ES':
            'Los usuarios podrán gestionar preferencias en el banner o ajustes disponibles. El bloqueo a nivel de navegador puede afectar funciones esenciales.',
          'de-DE':
            'Nutzer können Einstellungen über Banner oder bereitgestellte Konfigurationen verwalten. Browserseitiges Blockieren kann wesentliche Funktionen beeinträchtigen.',
        },
      },
      {
        title: { 'en-US': '6. Third parties', 'es-ES': '6. Terceros', 'de-DE': '6. Drittanbieter' },
        body: {
          'en-US':
            'Third-party cookies may be set by analytics, support, maps, payments, security or marketing vendors; duration and behaviour depend on their policies.',
          'es-ES':
            'Las cookies de terceros pueden ser establecidas por proveedores de analítica, soporte, mapas, pagos, seguridad o marketing; la duración y el comportamiento dependen de sus políticas.',
          'de-DE':
            'Cookies von Dritten können von Analyse-, Support-, Karten-, Zahlungs-, Sicherheits- oder Marketinganbietern gesetzt werden; Dauer und Verhalten richten sich nach deren Richtlinien.',
        },
      },
      {
        title: { 'en-US': '7. Retention', 'es-ES': '7. Conservación', 'de-DE': '7. Speicherdauer' },
        body: {
          'en-US':
            'Session cookies expire when the browser is closed. Persistent cookies remain for the period shown in the consent tool or until deleted by the user.',
          'es-ES':
            'Las cookies de sesión expiran al cerrar el navegador. Las persistentes permanecen por el plazo indicado en la herramienta de consentimiento o hasta su eliminación por el usuario.',
          'de-DE':
            'Sitzungs-Cookies verfallen beim Schließen des Browsers. Persistente Cookies bleiben für die in der Consent-Lösung angezeigte Dauer oder bis zur Löschung durch den Nutzer bestehen.',
        },
      },
      {
        title: { 'en-US': '8. Updates', 'es-ES': '8. Actualizaciones', 'de-DE': '8. Aktualisierungen' },
        body: {
          'en-US': 'This Policy may be updated when new technologies, categories or vendors are adopted.',
          'es-ES': 'Esta Política puede actualizarse cuando se adopten nuevas tecnologías, categorías o proveedores.',
          'de-DE': 'Diese Richtlinie kann aktualisiert werden, wenn neue Technologien, Kategorien oder Anbieter eingeführt werden.',
        },
      },
    ],
  },
  {
    type: 'MOBILE_EULA',
    titles: {
      'en-US': 'Aria Mobile App EULA',
      'es-ES': 'EULA y términos de la app móvil Aria',
      'de-DE': 'EULA / Nutzungsbedingungen der Aria-Mobile-App',
    },
    summaries: {
      'en-US':
        'Draft for mobile app: permissions, offline use, Apple/Google stores, GPS, camera, microphone and notifications.',
      'es-ES':
        'Borrador para app móvil: permisos, uso offline, tiendas Apple/Google, GPS, cámara, micrófono y notificaciones.',
      'de-DE':
        'Entwurf für mobile App: Berechtigungen, Offline-Nutzung, Apple-/Google-Stores, GPS, Kamera, Mikrofon und Benachrichtigungen.',
    },
    sections: [
      {
        title: { 'en-US': '1. Licence', 'es-ES': '1. Licencia', 'de-DE': '1. Lizenz' },
        body: {
          'en-US':
            'Aria grants a limited, revocable, non-exclusive, non-transferable licence to install and use the Aria mobile app under these terms, applicable policies and permissions granted by the Customer/tenant.',
          'es-ES':
            'Aria concede una licencia limitada, revocable, no exclusiva e intransferible para instalar y usar la app móvil Aria conforme a estos términos, políticas aplicables y permisos concedidos por el Cliente/tenant.',
          'de-DE':
            'Aria erteilt eine beschränkte, widerrufliche, nicht ausschließliche, nicht übertragbare Lizenz zur Installation und Nutzung der Aria-App gemäß diesen Bedingungen, anwendbaren Richtlinien und vom Kunden/Tenant erteilten Berechtigungen.',
        },
      },
      {
        title: { 'en-US': '2. App stores', 'es-ES': '2. Tiendas de aplicaciones', 'de-DE': '2. App-Stores' },
        body: {
          'en-US':
            'The app may be distributed via Apple App Store, Google Play or authorised channels; store rules also apply. Apple and Google are not responsible for Aria content, support or operation except for their own store obligations.',
          'es-ES':
            'La app puede distribuirse por Apple App Store, Google Play o canales autorizados; también aplican las reglas de las tiendas. Apple y Google no son responsables del contenido, soporte u operación de Aria, salvo obligaciones propias de la tienda.',
          'de-DE':
            'Die App kann über den Apple App Store, Google Play oder autorisierte Kanäle verteilt werden; Store-Regeln gelten ebenfalls. Apple und Google sind nicht für Inhalte, Support oder Betrieb von Aria verantwortlich, außer nach eigenen Store-Pflichten.',
        },
      },
      {
        title: { 'en-US': '3. Device permissions', 'es-ES': '3. Permisos del dispositivo', 'de-DE': '3. Geräteberechtigungen' },
        body: {
          'en-US':
            'The app may request camera, photos, location in use and in background, microphone, notifications, network, local storage, on-device biometrics and other resources required by subscribed modules.',
          'es-ES':
            'La app puede solicitar cámara, fotos, ubicación en uso y en segundo plano, micrófono, notificaciones, red, almacenamiento local, biometría local en el dispositivo y otros recursos necesarios para los módulos contratados.',
          'de-DE':
            'Die App kann Kamera, Fotos, Standort bei Nutzung und im Hintergrund, Mikrofon, Benachrichtigungen, Netzwerk, lokalen Speicher, lokale Gerätebiometrie und weitere für gebuchte Module erforderliche Ressourcen anfordern.',
        },
      },
      {
        title: { 'en-US': '4. Field use and offline mode', 'es-ES': '4. Uso en campo y modo offline', 'de-DE': '4. Einsatz vor Ort und Offline-Modus' },
        body: {
          'en-US':
            'The app may operate offline and later synchronise checklists, photos, geolocation, events, justifications and records. Users should review data before sending when the UI allows.',
          'es-ES':
            'La app puede operar sin conexión y sincronizar después checklists, fotos, geolocalización, eventos, justificativas y registros. El usuario debe revisar los datos antes del envío cuando la interfaz lo permita.',
          'de-DE':
            'Die App kann offline arbeiten und später Checklisten, Fotos, Geodaten, Ereignisse, Begründungen und Aufzeichnungen synchronisieren. Nutzer sollten – wenn die UI es erlaubt – Daten vor dem Senden prüfen.',
        },
      },
      {
        title: { 'en-US': '5. Location and operational monitoring', 'es-ES': '5. Ubicación y monitorización operativa', 'de-DE': '5. Standort und operatives Monitoring' },
        body: {
          'en-US':
            'When enabled by the tenant and accepted by the user where required, the app may collect location for check-in, routes, geofence, time tracking, security, audit and proof of execution. Details are in the Location Notice.',
          'es-ES':
            'Cuando el tenant lo habilite y el usuario lo acepte si se exige, la app puede recoger ubicación para check-in, rutas, geocerca, jornada, seguridad, auditoría y prueba de ejecución. Los detalles están en el Aviso de Geolocalización.',
          'de-DE':
            'Sofern vom Tenant aktiviert und vom Nutzer erforderlichenfalls akzeptiert, kann die App Standort für Check-in, Routen, Geofence, Zeiterfassung, Sicherheit, Audit und Ausführungsnachweise erfassen. Details siehe Standorthinweis.',
        },
      },
      {
        title: { 'en-US': '6. Biometrics and photos', 'es-ES': '6. Biometría y fotos', 'de-DE': '6. Biometrie und Fotos' },
        body: {
          'en-US':
            'The app may capture profile photos, documents, task photos and facial validations when configured. Biometric processing is governed by the Biometric Notice and Privacy Policy.',
          'es-ES':
            'La app puede capturar fotos de perfil, documentos, fotos de tareas y validaciones faciales cuando esté configurado. El tratamiento biométrico se rige por el Aviso de Biometría y la Política de Privacidad.',
          'de-DE':
            'Die App kann Profilfotos, Dokumente, Aufgabenfotos und Gesichtsvalidierungen erfassen, sofern konfiguriert. Biometrie unterliegt dem Biometrie-Hinweis und der Datenschutzerklärung.',
        },
      },
      {
        title: { 'en-US': '7. Prohibited conduct', 'es-ES': '7. Conductas prohibidas', 'de-DE': '7. Verbotenes Verhalten' },
        body: {
          'en-US':
            'Users must not tamper with the app, spoof location, bypass validations, share credentials, record false data, capture improper images, infringe third-party rights or use the app outside tenant policies.',
          'es-ES':
            'Está prohibido adulterar la app, simular ubicación, eludir validaciones, compartir credenciales, registrar datos falsos, capturar imágenes indebidas, violar derechos de terceros o usar la app fuera de las políticas del tenant.',
          'de-DE':
            'Nutzer dürfen die App nicht manipulieren, Standort vortäuschen, Validierungen umgehen, Zugangsdaten teilen, falsche Daten erfassen, unzulässige Bilder aufnehmen, Rechte Dritter verletzen oder die App außerhalb der Tenant-Richtlinien nutzen.',
        },
      },
      {
        title: { 'en-US': '8. Updates and compatibility', 'es-ES': '8. Actualizaciones y compatibilidad', 'de-DE': '8. Updates und Kompatibilität' },
        body: {
          'en-US':
            'Updates may fix issues, change features or require a new minimum OS version. Outdated devices, rooted/jailbroken devices or OS restrictions may block features.',
          'es-ES':
            'Las actualizaciones pueden corregir fallos, cambiar funciones o exigir una nueva versión mínima del SO. Dispositivos obsoletos, con root/jailbreak o restricciones del sistema pueden bloquear funciones.',
          'de-DE':
            'Updates können Fehler beheben, Funktionen ändern oder eine neue Mindest-OS-Version verlangen. Veraltete Geräte, Root/Jailbreak oder OS-Einschränkungen können Funktionen sperren.',
        },
      },
      {
        title: { 'en-US': '9. Support', 'es-ES': '9. Soporte', 'de-DE': '9. Support' },
        body: {
          'en-US':
            'Support is provided according to the tenant plan and indicated channels. Connectivity, GPS, camera, permissions and hardware issues may depend on OEM, OS or network.',
          'es-ES':
            'El soporte se presta según el plan del tenant y los canales indicados. Problemas de conectividad, GPS, cámara, permisos y hardware pueden depender del fabricante, SO o red.',
          'de-DE':
            'Support erfolgt gemäß Tenant-Plan und angegebenen Kanälen. Probleme mit Konnektivität, GPS, Kamera, Berechtigungen und Hardware können vom Hersteller, Betriebssystem oder Netz abhängen.',
        },
      },
      {
        title: { 'en-US': '10. Licence termination', 'es-ES': '10. Terminación de la licencia', 'de-DE': '10. Beendigung der Lizenz' },
        body: {
          'en-US':
            'The licence ends on account closure, tenant revocation, breach of these terms or discontinuation of the app. Local data may be erased or synchronised according to applicable policy.',
          'es-ES':
            'La licencia termina con el cierre de la cuenta, revocación del tenant, incumplimiento de estos términos o descontinuación de la app. Los datos locales pueden borrarse o sincronizarse según la política aplicable.',
          'de-DE':
            'Die Lizenz endet bei Kontoschließung, Tenant-Widerruf, Verstoß gegen diese Bedingungen oder Einstellung der App. Lokale Daten können gemäß anwendbarer Richtlinie gelöscht oder synchronisiert werden.',
        },
      },
    ],
  },
  {
    type: 'LOCATION_NOTICE',
    titles: {
      'en-US': 'Location and Operational Tracking Notice',
      'es-ES': 'Aviso de geolocalización y seguimiento operativo',
      'de-DE': 'Hinweis zu Standort und operativem Tracking',
    },
    summaries: {
      'en-US': 'Draft for foreground/background GPS, geofence, routes, check-in, retention and revocation.',
      'es-ES': 'Borrador para GPS en primer plano/segundo plano, geocerca, rutas, check-in, retención y revocación.',
      'de-DE': 'Entwurf für GPS im Vorder-/Hintergrund, Geofence, Routen, Check-in, Aufbewahrung und Widerruf.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Finalidad', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Notice explains when and why the Aria app may collect device location, including in the background, depending on tenant configuration and OS permissions.',
          'es-ES':
            'Este Aviso explica cuándo y por qué la app Aria puede recoger la ubicación del dispositivo, incluso en segundo plano, según la configuración del tenant y los permisos del sistema operativo.',
          'de-DE':
            'Dieser Hinweis erläutert, wann und warum die Aria-App den Gerätestandort erfassen kann, einschließlich im Hintergrund, abhängig von Tenant-Konfiguration und OS-Berechtigungen.',
        },
      },
      {
        title: { 'en-US': '2. When we collect location', 'es-ES': '2. Cuándo recogemos ubicación', 'de-DE': '2. Wann wir Standort erfassen' },
        body: {
          'en-US':
            'Collection may occur when signing in, accepting a work order, starting travel, entering/leaving a geofence, check-in/out, recording time tracking, sending operational heartbeats, justifying exceptions or performing tasks requiring proof of presence.',
          'es-ES':
            'La recogida puede ocurrir al iniciar sesión, aceptar una orden de servicio, iniciar desplazamiento, entrar/salir de geocerca, check-in/out, registrar jornada, enviar latidos operativos, justificar excepciones o ejecutar tareas que exijan prueba de presencia.',
          'de-DE':
            'Die Erfassung kann bei Anmeldung, Annahme eines Arbeitsauftrags, Fahrtbeginn, Betreten/Verlassen einer Geofence, Check-in/out, Zeiterfassung, operativen Heartbeats, Ausnahmebegründungen oder Aufgaben mit Anwesenheitsnachweis erfolgen.',
        },
      },
      {
        title: { 'en-US': '3. Background location', 'es-ES': '3. Ubicación en segundo plano', 'de-DE': '3. Standort im Hintergrund' },
        body: {
          'en-US':
            'When enabled, background location may be collected during travel, service execution or active time tracking, even if the app is minimised, subject to tenant policies, device permissions and applicable legal bases.',
          'es-ES':
            'Cuando esté habilitada, la ubicación en segundo plano puede recogerse durante desplazamientos, atención o jornada activa, incluso con la app minimizada, respetando políticas del tenant, permisos del dispositivo y bases legales aplicables.',
          'de-DE':
            'Wenn aktiviert, kann der Hintergrundstandort während Fahrten, Serviceausführung oder aktiver Zeiterfassung erhoben werden, auch wenn die App minimiert ist – gemäß Tenant-Richtlinien, Geräteberechtigungen und anwendbaren Rechtsgrundlagen.',
        },
      },
      {
        title: { 'en-US': '4. Data collected', 'es-ES': '4. Datos recogidos', 'de-DE': '4. Erfasste Daten' },
        body: {
          'en-US':
            'We may process latitude, longitude, accuracy, altitude, speed, bearing, timestamps, location source, network status, battery, app version, pseudonymised device ID, geofence events and integrity signals.',
          'es-ES':
            'Podemos tratar latitud, longitud, precisión, altitud, velocidad, rumbo, marcas de tiempo, fuente de ubicación, estado de red, batería, versión de la app, ID de dispositivo seudonimizado, eventos de geocerca y señales de integridad.',
          'de-DE':
            'Wir können Breiten-/Längengrad, Genauigkeit, Höhe, Geschwindigkeit, Richtung, Zeitstempel, Standortquelle, Netzstatus, Batterie, App-Version, pseudonymisierte Geräte-ID, Geofence-Ereignisse und Integritätssignale verarbeiten.',
        },
      },
      {
        title: { 'en-US': '5. Who can access', 'es-ES': '5. Quién puede acceder', 'de-DE': '5. Wer Zugriff hat' },
        body: {
          'en-US':
            'Authorised tenant administrators, operational managers, Aria support and necessary subprocessors may access data according to role, purpose and need.',
          'es-ES':
            'Administradores autorizados del tenant, gestores operativos, soporte de Aria y suboperadores necesarios pueden acceder a los datos según perfil, finalidad y necesidad.',
          'de-DE':
            'Autorisierte Tenant-Administratoren, operative Manager, Aria-Support und erforderliche Subprozessoren können je nach Rolle, Zweck und Bedarf zugreifen.',
        },
      },
      {
        title: { 'en-US': '6. Retention', 'es-ES': '6. Conservación', 'de-DE': '6. Aufbewahrung' },
        body: {
          'en-US':
            'Raw GPS should be kept for a short period. Check-in/out, geofence events and legal evidence may be retained longer under the Data Retention Policy and tenant obligations.',
          'es-ES':
            'El GPS bruto debe conservarse por un periodo corto. Los eventos de check-in/out, geocerca y evidencias legales pueden retenerse por más tiempo según la Política de Retención y obligaciones del tenant.',
          'de-DE':
            'Roh-GPS sollte nur kurz aufbewahrt werden. Check-in/out-, Geofence-Ereignisse und Beweismittel können gemäß Aufbewahrungsrichtlinie und Tenant-Pflichten länger gespeichert werden.',
        },
      },
      {
        title: { 'en-US': '7. Revocation and consequences', 'es-ES': '7. Revocación y consecuencias', 'de-DE': '7. Widerruf und Folgen' },
        body: {
          'en-US':
            'Users may revoke OS permissions. Revocation may prevent check-in, time tracking, routes, proof of presence or modules that depend on GPS.',
          'es-ES':
            'El usuario puede revocar permisos del sistema operativo. La revocación puede impedir check-in, jornada, rutas, prueba de presencia o módulos que dependan del GPS.',
          'de-DE':
            'Nutzer können OS-Berechtigungen widerrufen. Ein Widerruf kann Check-in, Zeiterfassung, Routen, Anwesenheitsnachweise oder GPS-abhängige Module verhindern.',
        },
      },
      {
        title: { 'en-US': '8. Prohibition of abusive tracking', 'es-ES': '8. Prohibición de rastreo abusivo', 'de-DE': '8. Verbot missbräuchlicher Überwachung' },
        body: {
          'en-US':
            'The tenant should avoid unnecessary, permanent or disproportionate tracking incompatible with the stated purpose. Aria recommends proportionality and legal review for employment or contractor relationships.',
          'es-ES':
            'El tenant debe evitar rastreo innecesario, permanente o desproporcionado incompatible con la finalidad informada. Aria recomienda proporcionalidad y revisión jurídica en relaciones laborales o de prestación de servicios.',
          'de-DE':
            'Der Tenant soll unnötiges, dauerhaftes oder unverhältnismäßiges Tracking vermeiden, das mit dem angegebenen Zweck unvereinbar ist. Aria empfiehlt Verhältnismäßigkeit und juristische Prüfung bei Arbeits- oder Dienstleistungsverhältnissen.',
        },
      },
      {
        title: { 'en-US': '9. Integrity signals', 'es-ES': '9. Integridad', 'de-DE': '9. Integritätssignale' },
        body: {
          'en-US':
            'The platform may detect mocked locations, rooted/jailbroken devices, clock tampering and other inconsistencies for security, audit and fraud prevention.',
          'es-ES':
            'La plataforma puede detectar ubicación simulada, dispositivos con root/jailbreak, manipulación del reloj y otras inconsistencias para seguridad, auditoría y prevención de fraude.',
          'de-DE':
            'Die Plattform kann vorgetäuschte Standorte, Root/Jailbreak, manipulierte Systemzeit und andere Inkonsistenzen zu Sicherheit, Audit und Betrugsprävention erkennen.',
        },
      },
    ],
  },
  {
    type: 'BIOMETRIC_NOTICE',
    titles: {
      'en-US': 'Biometric and Facial Recognition Notice',
      'es-ES': 'Aviso de biometría y reconocimiento facial',
      'de-DE': 'Hinweis zu Biometrie und Gesichtserkennung',
    },
    summaries: {
      'en-US': 'Draft for facial images and biometric templates as sensitive data, enrollment, human review and alternatives.',
      'es-ES':
        'Borrador para imágenes faciales y plantillas biométricas como datos sensibles, registro, revisión humana y alternativas.',
      'de-DE':
        'Entwurf für Gesichtsbilder und Biometrietemplates als besondere Daten, Registrierung, menschliche Prüfung und Alternativen.',
    },
    sections: [
      {
        title: { 'en-US': '1. Scope', 'es-ES': '1. Alcance', 'de-DE': '1. Geltungsbereich' },
        body: {
          'en-US':
            'This Notice governs capture and use of facial images and biometric templates in the Aria app and admin console when the tenant enables facial recognition, time tracking, check-in, KYC or identity validation modules.',
          'es-ES':
            'Este Aviso regula la captura y uso de imágenes faciales y plantillas biométricas en la app y el panel Aria cuando el tenant habilite reconocimiento facial, puesto, check-in, KYC o validación de identidad.',
          'de-DE':
            'Dieser Hinweis regelt Erfassung und Nutzung von Gesichtsbildern und Biometrietemplates in der Aria-App und Admin-Konsole, wenn der Tenant Gesichtserkennung, Zeiterfassung, Check-in, KYC oder Identitätsprüfung aktiviert.',
        },
      },
      {
        title: { 'en-US': '2. Sensitive nature', 'es-ES': '2. Naturaleza sensible', 'de-DE': '2. Besonderheit der Daten' },
        body: {
          'en-US':
            'Biometric data are sensitive personal data under the LGPD. Processing requires a legitimate purpose, transparency, minimisation, reinforced security and an adequate legal basis.',
          'es-ES':
            'Los datos biométricos son datos personales sensibles según la LGPD. Su tratamiento exige finalidad legítima, transparencia, minimización, seguridad reforzada y base legal adecuada.',
          'de-DE':
            'Biometriedaten sind nach LGPD besonders schützenswert. Die Verarbeitung erfordert legitime Zwecke, Transparenz, Minimierung, verstärkte Sicherheit und eine angemessene Rechtsgrundlage.',
        },
      },
      {
        title: { 'en-US': '3. Purposes', 'es-ES': '3. Finalidades', 'de-DE': '3. Zwecke' },
        body: {
          'en-US':
            'Biometrics may be used to confirm identity, prevent fraud, record time tracking, validate presence on tasks, approve contractor onboarding, protect accounts and audit operational events.',
          'es-ES':
            'La biometría puede usarse para confirmar identidad, prevenir fraude, registrar jornada, validar presencia en tareas, aprobar onboarding de contratistas, proteger cuentas y auditar eventos operativos.',
          'de-DE':
            'Biometrie kann zur Identitätsbestätigung, Betrugsprävention, Zeiterfassung, Validierung der Anwesenheit bei Aufgaben, Freigabe von Contractor-Onboarding, Kontoschutz und Audit operativer Ereignisse genutzt werden.',
        },
      },
      {
        title: { 'en-US': '4. Data processed', 'es-ES': '4. Datos tratados', 'de-DE': '4. Verarbeitete Daten' },
        body: {
          'en-US':
            'We may process baseline photos, selfies, check-in images, similarity scores, validation engine output, enrolment status, timestamps, device ID, tenant identifiers and technical evidence.',
          'es-ES':
            'Podemos tratar fotos base, selfies, imágenes de check-in, puntuaciones de similitud, salida del motor de validación, estado de registro facial, marcas de tiempo, ID de dispositivo, identificadores del tenant y evidencias técnicas.',
          'de-DE':
            'Wir können Basis-Fotos, Selfies, Check-in-Bilder, Ähnlichkeitswerte, Ausgaben der Validierungsengine, Registrierungsstatus, Zeitstempel, Geräte-ID, Tenant-Kennungen und technische Nachweise verarbeiten.',
        },
      },
      {
        title: { 'en-US': '5. Decisions and human review', 'es-ES': '5. Decisiones y revisión humana', 'de-DE': '5. Entscheidungen und menschliche Prüfung' },
        body: {
          'en-US':
            'Biometric results are decision-support only. Rejections, suspicions or impactful blocks should allow human review, justification or an exception workflow where applicable.',
          'es-ES':
            'Los resultados biométricos son apoyo a la decisión. Rechazos, sospechas o bloqueos relevantes deben admitir revisión humana, justificación o flujo de excepción cuando aplique.',
          'de-DE':
            'Biometrieergebnisse dienen nur der Entscheidungsunterstützung. Ablehnungen, Verdachtsfälle oder wirkungsvolle Sperren sollten – soweit anwendbar – menschliche Prüfung, Begründung oder Ausnahmeprozesse ermöglichen.',
        },
      },
      {
        title: { 'en-US': '6. Alternatives', 'es-ES': '6. Alternativas', 'de-DE': '6. Alternativen' },
        body: {
          'en-US':
            'Where legally required or operationally reasonable, the tenant should evaluate less intrusive alternatives such as codes, documents, manual approval or exception justifications.',
          'es-ES':
            'Cuando sea jurídicamente necesario u operativamente razonable, el tenant debe evaluar alternativas menos intrusivas como códigos, documentos, aprobación manual o justificativas de excepción.',
          'de-DE':
            'Sofern rechtlich erforderlich oder betrieblich zumutbar, soll der Tenant weniger intrusive Alternativen prüfen, z. B. Codes, Dokumente, manuelle Freigabe oder Ausnahmebegründungen.',
        },
      },
      {
        title: { 'en-US': '7. Retention and deletion', 'es-ES': '7. Conservación y eliminación', 'de-DE': '7. Aufbewahrung und Löschung' },
        body: {
          'en-US':
            'Baseline photos and biometric evidence should be kept only as long as necessary for the purpose, contract, legal obligation or defence of rights. Data subjects may request deletion where applicable.',
          'es-ES':
            'Las fotos base y evidencias biométricas deben conservarse solo el tiempo necesario para la finalidad, contrato, obligación legal o defensa de derechos. Los titulares pueden solicitar eliminación cuando proceda.',
          'de-DE':
            'Basis-Fotos und Biometrienachweise sollten nur so lange aufbewahrt werden, wie Zweck, Vertrag, gesetzliche Pflicht oder Rechtsverteilung es erfordern. Betroffene können – soweit anwendbar – Löschung verlangen.',
        },
      },
      {
        title: { 'en-US': '8. Security and access', 'es-ES': '8. Seguridad y acceso', 'de-DE': '8. Sicherheit und Zugriff' },
        body: {
          'en-US':
            'Access to biometric data must be limited to authorised profiles. Biometric subprocessors must assume compatible confidentiality, security and data protection obligations.',
          'es-ES':
            'El acceso a datos biométricos debe limitarse a perfiles autorizados. Los suboperadores de biometría deben asumir obligaciones compatibles de confidencialidad, seguridad y protección de datos.',
          'de-DE':
            'Der Zugriff auf Biometriedaten muss auf autorisierte Profile beschränkt sein. Biometrie-Subprozessoren müssen vergleichbare Vertraulichkeits-, Sicherheits- und Datenschutzpflichten übernehmen.',
        },
      },
      {
        title: { 'en-US': '9. Consent and revocation', 'es-ES': '9. Consentimiento y revocación', 'de-DE': '9. Einwilligung und Widerruf' },
        body: {
          'en-US':
            'Where consent is the legal basis, it must be freely given, informed, specific and withdrawable. Withdrawal may limit modules that depend on biometric validation.',
          'es-ES':
            'Cuando la base legal sea el consentimiento, debe ser libre, informado, destacado y revocable. La revocación puede limitar módulos que dependan de validación biométrica.',
          'de-DE':
            'Stützt sich die Verarbeitung auf Einwilligung, muss sie freiwillig, informiert, bestimmt und widerruflich sein. Ein Widerruf kann Module einschränken, die Biometrievalidierung erfordern.',
        },
      },
    ],
  },
  {
    type: 'WORK_TIME_POLICY',
    titles: {
      'en-US': 'Time Tracking, Attendance and Hours Policy',
      'es-ES': 'Política de jornada, fichaje y registro de horas',
      'de-DE': 'Richtlinie zu Arbeitszeit, Anwesenheit und Zeiterfassung',
    },
    summaries: {
      'en-US': 'Draft for time records with GPS, face, address, exceptions, CLT/PJ contexts and audit.',
      'es-ES': 'Borrador para registros de jornada con GPS, rostro, dirección, excepciones, contextos CLT/PJ y auditoría.',
      'de-DE': 'Entwurf für Zeiterfassung mit GPS, Gesicht, Adresse, Ausnahmen, CLT/PJ-Kontexten und Audit.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Objetivo', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Policy governs use of hours, attendance and time tracking modules in the Aria app according to tenant configuration and applicable law.',
          'es-ES':
            'Esta Política disciplina el uso de los módulos de registro de horas, presencia y jornada en la app Aria según la configuración del tenant y la legislación aplicable.',
          'de-DE':
            'Diese Richtlinie regelt die Nutzung von Stunden-, Anwesenheits- und Zeiterfassungsmodulen in der Aria-App gemäß Tenant-Konfiguration und anwendbarem Recht.',
        },
      },
      {
        title: { 'en-US': '2. Employment regimes', 'es-ES': '2. Regímenes laborales', 'de-DE': '2. Beschäftigungsmodelle' },
        body: {
          'en-US':
            'The tenant must correctly classify users as CLT employees, independent contractors (PJ), third parties or other regimes. Aria provides tooling and does not determine employment relationships.',
          'es-ES':
            'El tenant debe clasificar correctamente a los usuarios como empleados CLT, contratistas independientes (PJ), terceros u otros regímenes. Aria provee herramientas y no define vínculos laborales.',
          'de-DE':
            'Der Tenant muss Nutzer korrekt als CLT-Arbeitnehmer, selbstständige Auftragnehmer (PJ), Dritte oder andere Modelle einordnen. Aria stellt Werkzeuge bereit und bestimmt keine Arbeitsverhältnisse.',
        },
      },
      {
        title: { 'en-US': '3. Recorded events', 'es-ES': '3. Eventos registrados', 'de-DE': '3. Erfasste Ereignisse' },
        body: {
          'en-US':
            'Events may include shift start/end, breaks, return, check-in/out, exceptions, justifications, resolved address, GPS, accuracy, photo/face, device and server timestamps and integrity validations.',
          'es-ES':
            'Los eventos pueden incluir inicio/fin de jornada, pausas, retorno, check-in/out, excepciones, justificativas, dirección resuelta, GPS, precisión, foto/rostro, marcas de tiempo de dispositivo y servidor y validaciones de integridad.',
          'de-DE':
            'Erfasst werden können Schichtbeginn/-ende, Pausen, Rückkehr, Check-in/out, Ausnahmen, Begründungen, aufgelöste Adresse, GPS, Genauigkeit, Foto/Gesicht, Geräte- und Serverzeitstempel und Integritätsprüfungen.',
        },
      },
      {
        title: { 'en-US': '4. User responsibilities', 'es-ES': '4. Responsabilidades del usuario', 'de-DE': '4. Pflichten der Nutzer' },
        body: {
          'en-US':
            'Users must record events truthfully and on time, must not share credentials, spoof location, tamper with time or have third parties clock in on their behalf.',
          'es-ES':
            'Los usuarios deben registrar eventos de forma veraz y oportuna, no compartir credenciales, simular ubicación, manipular la hora ni pedir a terceros que registren por ellos.',
          'de-DE':
            'Nutzer müssen Ereignisse wahrheitsgemäß und rechtzeitig erfassen, keine Zugangsdaten teilen, keinen Standort vortäuschen, die Zeit nicht manipulieren und keine Dritten zum Erfassen für sich nutzen.',
        },
      },
      {
        title: { 'en-US': '5. Tenant responsibilities', 'es-ES': '5. Responsabilidades del tenant', 'de-DE': '5. Pflichten des Tenants' },
        body: {
          'en-US':
            'The tenant must configure rules appropriate to the legal regime, inform workers, obtain legal bases, review exceptions, fix inconsistencies and avoid disproportionate monitoring.',
          'es-ES':
            'El tenant debe configurar reglas adecuadas al régimen jurídico, informar a trabajadores, obtener bases legales, revisar excepciones, corregir inconsistencias y evitar monitorización desproporcionada.',
          'de-DE':
            'Der Tenant muss regelkonforme Einstellungen für das Rechtsregime treffen, Arbeitnehmer informieren, Rechtsgrundlagen einholen, Ausnahmen prüfen, Inkonsistenzen beheben und unverhältnismäßiges Monitoring vermeiden.',
        },
      },
      {
        title: { 'en-US': '6. Exceptions', 'es-ES': '6. Excepciones', 'de-DE': '6. Ausnahmen' },
        body: {
          'en-US':
            'GPS, camera, connectivity, facial recognition, address or clock failures may generate exceptional records with justification. Exceptions should be reviewed by an authorised manager.',
          'es-ES':
            'Fallos de GPS, cámara, conectividad, reconocimiento facial, dirección o reloj pueden generar registros excepcionales con justificación. Las excepciones deben ser revisadas por un gestor autorizado.',
          'de-DE':
            'Ausfälle von GPS, Kamera, Konnektivität, Gesichtserkennung, Adresse oder Uhr können Ausnahmeerfassungen mit Begründung erzeugen. Ausnahmen sind durch eine berechtigte Führungskraft zu prüfen.',
        },
      },
      {
        title: { 'en-US': '7. Sensitive data and location', 'es-ES': '7. Datos sensibles y ubicación', 'de-DE': '7. Besondere Daten und Standort' },
        body: {
          'en-US':
            'Where face and GPS are used, the Biometric Notice, Location Notice and Privacy Policy apply.',
          'es-ES':
            'Cuando se usen rostro y GPS, aplican el Aviso de Biometría, el Aviso de Geolocalización y la Política de Privacidad.',
          'de-DE':
            'Bei Gesicht und GPS gelten der Biometrie-Hinweis, der Standorthinweis und die Datenschutzerklärung.',
        },
      },
      {
        title: { 'en-US': '8. Retention', 'es-ES': '8. Conservación', 'de-DE': '8. Aufbewahrung' },
        body: {
          'en-US':
            'Time records and associated evidence may be retained for periods required by labour, tax, contractual law and defence of rights.',
          'es-ES':
            'Los registros de jornada y evidencias asociadas pueden conservarse por plazos necesarios para legislación laboral, fiscal, contractual y defensa de derechos.',
          'de-DE':
            'Zeiterfassungen und zugehörige Nachweise können für die nach Arbeits-, Steuer-, Vertragsrecht und Rechtsverteidigung erforderlichen Zeiträume aufbewahrt werden.',
        },
      },
      {
        title: {
          'en-US': '9. Not a substitute for labour counsel',
          'es-ES': '9. No sustituye asesoría laboral',
          'de-DE': '9. Kein Ersatz für arbeitsrechtliche Beratung',
        },
        body: {
          'en-US':
            'Aria does not replace the Customer’s legal, accounting or HR advisors. Settings must be validated by the Customer’s specialists.',
          'es-ES':
            'Aria no sustituye asesoría jurídica, contable o laboral del Cliente. Las configuraciones deben ser validadas por especialistas del Cliente.',
          'de-DE':
            'Aria ersetzt keine juristische, steuerliche oder HR-Beratung des Kunden. Einstellungen müssen von Fachleuten des Kunden validiert werden.',
        },
      },
    ],
  },
  {
    type: 'AI_USAGE_POLICY',
    titles: {
      'en-US': 'Artificial Intelligence Use Policy',
      'es-ES': 'Política de uso de inteligencia artificial',
      'de-DE': 'Richtlinie zur Nutzung von Künstlicher Intelligenz',
    },
    summaries: {
      'en-US': 'Draft for LLM, computer vision, image analysis, human review, limitations and AI subprocessors.',
      'es-ES': 'Borrador para LLM, visión por computador, análisis de imágenes, revisión humana, limitaciones y suboperadores de IA.',
      'de-DE': 'Entwurf für LLM, Computer Vision, Bildanalyse, menschliche Prüfung, Grenzen und KI-Subprozessoren.',
    },
    sections: [
      {
        title: { 'en-US': '1. Scope', 'es-ES': '1. Alcance', 'de-DE': '1. Geltungsbereich' },
        body: {
          'en-US':
            'Aria may use AI, machine learning, computer vision, OCR, image analysis, classification, recommendations and language assistants to support platform features.',
          'es-ES':
            'Aria puede usar IA, aprendizaje automático, visión por computador, OCR, análisis de imágenes, clasificación, recomendaciones y asistentes de lenguaje para apoyar funcionalidades de la plataforma.',
          'de-DE':
            'Aria kann KI, maschinelles Lernen, Computer Vision, OCR, Bildanalyse, Klassifikation, Empfehlungen und Sprachassistenten zur Unterstützung von Plattformfunktionen einsetzen.',
        },
      },
      {
        title: { 'en-US': '2. Purposes', 'es-ES': '2. Finalidades', 'de-DE': '2. Zwecke' },
        body: {
          'en-US':
            'AI may help interpret checklists, analyse photos, suggest answers, classify assets, detect non-conformities, assist support, summarise data, generate reports and improve productivity.',
          'es-ES':
            'La IA puede ayudar a interpretar checklists, analizar fotos, sugerir respuestas, clasificar activos, detectar inconformidades, auxiliar soporte, resumir datos, generar informes y mejorar la productividad.',
          'de-DE':
            'KI kann Checklisten interpretieren, Fotos analysieren, Antworten vorschlagen, Vermögenswerte klassifizieren, Abweichungen erkennen, Support unterstützen, Daten zusammenfassen, Berichte erzeugen und Produktivität verbessern.',
        },
      },
      {
        title: { 'en-US': '3. Limitations', 'es-ES': '3. Limitaciones', 'de-DE': '3. Grenzen' },
        body: {
          'en-US':
            'AI outputs may be wrong, biased, incomplete or imprecise. They must not replace human judgement, technical opinions, disciplinary, medical, legal, financial or labour decisions without qualified review.',
          'es-ES':
            'Las salidas de IA pueden ser incorrectas, sesgadas, incompletas o imprecisas. No deben sustituir el juicio humano, dictámenes técnicos ni decisiones disciplinarias, médicas, jurídicas, financieras o laborales sin revisión cualificada.',
          'de-DE':
            'KI-Ausgaben können fehlerhaft, verzerrt, unvollständig oder ungenau sein. Sie dürfen menschliches Urteil, technische Gutachten oder disziplinarische, medizinische, rechtliche, finanzielle oder arbeitsrechtliche Entscheidungen ohne qualifizierte Prüfung nicht ersetzen.',
        },
      },
      {
        title: { 'en-US': '4. Data sent to AI', 'es-ES': '4. Datos enviados a IA', 'de-DE': '4. An KI übermittelte Daten' },
        body: {
          'en-US':
            'Texts, images, metadata, questions, checklist answers, task data and operational context may be processed. The tenant should avoid excessive, sensitive or unnecessary inputs.',
          'es-ES':
            'Pueden procesarse textos, imágenes, metadatos, preguntas, respuestas de checklist, datos de tarea y contexto operativo. El tenant debe evitar entradas excesivas, sensibles o innecesarias.',
          'de-DE':
            'Texte, Bilder, Metadaten, Fragen, Checklisten-Antworten, Aufgabendaten und operativer Kontext können verarbeitet werden. Der Tenant soll übermäßige, sensible oder unnötige Eingaben vermeiden.',
        },
      },
      {
        title: { 'en-US': '5. AI subprocessors', 'es-ES': '5. Suboperadores de IA', 'de-DE': '5. KI-Subprozessoren' },
        body: {
          'en-US':
            'Aria may use first-party or third-party AI providers, including models hosted on Aria infrastructure or external APIs. The subprocessor list should name relevant providers where applicable.',
          'es-ES':
            'Aria puede usar proveedores de IA propios o terceros, incluidos modelos alojados en infraestructura Aria o APIs externas. La lista de suboperadores debe indicar proveedores relevantes cuando aplique.',
          'de-DE':
            'Aria kann eigene oder Drittanbieter-KI nutzen, einschließlich Modelle auf Aria-Infrastruktur oder externe APIs. Die Subprozessorliste soll relevante Anbieter benennen, soweit anwendbar.',
        },
      },
      {
        title: { 'en-US': '6. Automated decisions', 'es-ES': '6. Decisiones automatizadas', 'de-DE': '6. Automatisierte Entscheidungen' },
        body: {
          'en-US':
            'The platform must not be used for solely automated decisions with legal or similarly significant effects on individuals without legal basis, transparency and meaningful human review.',
          'es-ES':
            'La plataforma no debe usarse para decisiones exclusivamente automatizadas con efectos jurídicos o significativamente similares sobre titulares sin base legal, transparencia y revisión humana significativa.',
          'de-DE':
            'Die Plattform darf nicht für ausschließlich automatisierte Entscheidungen mit rechtlicher oder vergleichbar erheblicher Wirkung ohne Rechtsgrundlage, Transparenz und wirksame menschliche Prüfung genutzt werden.',
        },
      },
      {
        title: { 'en-US': '7. Prohibited use', 'es-ES': '7. Uso prohibido', 'de-DE': '7. Verbotene Nutzung' },
        body: {
          'en-US':
            'AI must not be used for discrimination, abusive surveillance, improper identification, illegal content, social engineering, copyright infringement or processing without a legal basis.',
          'es-ES':
            'Está prohibido usar IA para discriminación, vigilancia abusiva, identificación indebida, contenido ilegal, ingeniería social, violación de derechos de autor o tratamiento sin base legal.',
          'de-DE':
            'KI darf nicht für Diskriminierung, missbräuchliche Überwachung, unzulässige Identifikation, rechtswidrige Inhalte, Social Engineering, Urheberrechtsverletzungen oder Verarbeitung ohne Rechtsgrundlage genutzt werden.',
        },
      },
      {
        title: { 'en-US': '8. Logs and improvement', 'es-ES': '8. Registros y mejora', 'de-DE': '8. Protokolle und Verbesserung' },
        body: {
          'en-US':
            'Interactions may be logged for security, audit, quality, support and improvement, subject to contracts, configuration, retention and confidentiality.',
          'es-ES':
            'Las interacciones pueden registrarse para seguridad, auditoría, calidad, soporte y mejora, respetando contratos, configuración, retención y confidencialidad.',
          'de-DE':
            'Interaktionen können zu Sicherheit, Audit, Qualität, Support und Verbesserung protokolliert werden – gemäß Verträgen, Konfiguration, Aufbewahrung und Vertraulichkeit.',
        },
      },
      {
        title: { 'en-US': '9. Tenant responsibility', 'es-ES': '9. Responsabilidad del tenant', 'de-DE': '9. Verantwortung des Tenants' },
        body: {
          'en-US':
            'The tenant is responsible for validating outputs before acting, training users and configuring human review flows commensurate with risk.',
          'es-ES':
            'El tenant es responsable de validar resultados antes de actuar, formar usuarios y configurar flujos de revisión humana acordes al riesgo.',
          'de-DE':
            'Der Tenant ist verantwortlich für die Validierung von Ergebnissen vor Maßnahmen, Schulung der Nutzer und Konfiguration menschlicher Prüfprozesse passend zum Risiko.',
        },
      },
    ],
  },
  {
    type: 'DATA_RETENTION_POLICY',
    titles: {
      'en-US': 'Data Retention and Deletion Policy',
      'es-ES': 'Política de retención y eliminación de datos',
      'de-DE': 'Richtlinie zur Datenaufbewahrung und -löschung',
    },
    summaries: {
      'en-US': 'Draft layers for raw GPS, audit, legal evidence, metrics, accounts and backups.',
      'es-ES': 'Borrador por capas para GPS bruto, auditoría, evidencias legales, métricas, cuentas y copias de seguridad.',
      'de-DE': 'Entwurf für Roh-GPS, Audit, Beweismittel, Metriken, Konten und Backups.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Objetivo', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Policy sets principles and reference periods for retention, archiving, anonymisation and deletion of data processed by Aria.',
          'es-ES':
            'Esta Política define principios y plazos referenciales para retención, archivo, anonimización y eliminación de datos tratados por Aria.',
          'de-DE':
            'Diese Richtlinie legt Grundsätze und Referenzfristen für Aufbewahrung, Archivierung, Anonymisierung und Löschung durch Aria verarbeiteter Daten fest.',
        },
      },
      {
        title: { 'en-US': '2. Principles', 'es-ES': '2. Principios', 'de-DE': '2. Grundsätze' },
        body: {
          'en-US':
            'We apply minimisation, purpose limitation, necessity, security, traceability, tenant segregation and retention proportionate to risk and legal duty.',
          'es-ES':
            'Aplicamos minimización, finalidad, necesidad, seguridad, trazabilidad, segregación por tenant y retención proporcional al riesgo y obligación legal.',
          'de-DE':
            'Wir wenden Minimierung, Zweckbindung, Erforderlichkeit, Sicherheit, Nachvollziehbarkeit, Mandantentrennung und risiko- und pflichtangemessene Aufbewahrung an.',
        },
      },
      {
        title: { 'en-US': '3. Raw GPS', 'es-ES': '3. GPS bruto', 'de-DE': '3. Roh-GPS' },
        body: {
          'en-US':
            'Frequent heartbeats, raw tracks and high-volume telemetry should have short retention, typically between 7 and 90 days, depending on tenant policy and operational need.',
          'es-ES':
            'Latidos frecuentes, trazas brutas y telemetría de alto volumen deben tener retención corta, preferiblemente entre 7 y 90 días, según política del tenant y necesidad operativa.',
          'de-DE':
            'Häufige Heartbeats, Rohtrajektorien und hochvolumige Telemetrie sollten kurz aufbewahrt werden, typischerweise zwischen 7 und 90 Tagen, je nach Tenant-Richtlinie und Bedarf.',
        },
      },
      {
        title: { 'en-US': '4. Operational events', 'es-ES': '4. Eventos operativos', 'de-DE': '4. Operative Ereignisse' },
        body: {
          'en-US':
            'Check-in/out, geofence, task status, sync, exceptions and operational audit may be kept for months or years depending on support, audit, contract and defence needs.',
          'es-ES':
            'Check-in/out, geocerca, estado de tarea, sincronización, excepciones y auditoría operativa pueden conservarse meses o años según soporte, auditoría, contrato y defensa de derechos.',
          'de-DE':
            'Check-in/out, Geofence, Aufgabenstatus, Sync, Ausnahmen und operatives Audit können je nach Support, Prüfung, Vertrag und Rechtsverteidigung monate- oder jahrelang gespeichert werden.',
        },
      },
      {
        title: { 'en-US': '5. Legal evidence', 'es-ES': '5. Evidencias legales', 'de-DE': '5. Beweismittel' },
        body: {
          'en-US':
            'Time records, consents, document acceptances, critical logs, work order evidence, mandatory photos, disputes and reports may be kept for periods aligned with labour, civil, tax or regulatory duties.',
          'es-ES':
            'Registros de jornada, consentimientos, aceptaciones de documentos, registros críticos, evidencias de OS, fotos obligatorias, disputas e informes pueden conservarse por plazos alineados con obligaciones laborales, civiles, fiscales o regulatorias.',
          'de-DE':
            'Zeiterfassungen, Einwilligungen, Dokumentenakzeptanzen, kritische Protokolle, Arbeitsauftragsnachweise, Pflichtfotos, Streitigkeiten und Berichte können für arbeits-, zivil-, steuer- oder aufsichtsrechtliche Pflichten aufbewahrt werden.',
        },
      },
      {
        title: { 'en-US': '6. Metrics and analytics', 'es-ES': '6. Métricas y analítica', 'de-DE': '6. Metriken und Analysen' },
        body: {
          'en-US':
            'Aggregated, anonymised or pseudonymised metrics may be kept longer for product improvement, capacity, security and historical analysis.',
          'es-ES':
            'Métricas agregadas, anonimizadas o seudonimizadas pueden conservarse por más tiempo para mejora del producto, capacidad, seguridad y análisis histórico.',
          'de-DE':
            'Aggregierte, anonymisierte oder pseudonymisierte Metriken können länger für Produktverbesserung, Kapazität, Sicherheit und historische Analysen gespeichert werden.',
        },
      },
      {
        title: { 'en-US': '7. Closed accounts', 'es-ES': '7. Cuenta cerrada', 'de-DE': '7. Geschlossene Konten' },
        body: {
          'en-US':
            'After closure, data may remain for export windows, billing, audit, legal duties or defence of rights, and then be deleted or anonymised.',
          'es-ES':
            'Tras el cierre, los datos pueden permanecer por periodo de exportación, facturación, auditoría, obligación legal o defensa de derechos, y luego eliminarse o anonimizarse.',
          'de-DE':
            'Nach Schließung können Daten für Exportfristen, Abrechnung, Audit, gesetzliche Pflichten oder Rechtsverteidigung verbleiben und anschließend gelöscht oder anonymisiert werden.',
        },
      },
      {
        title: { 'en-US': '8. Backups', 'es-ES': '8. Copias de seguridad', 'de-DE': '8. Backups' },
        body: {
          'en-US':
            'Backups follow technical cycles and may retain data for a limited technical period. Logical deletion may take time to propagate until backup rotation expires.',
          'es-ES':
            'Las copias siguen ciclos técnicos y pueden retener datos por un periodo técnico limitado. La eliminación lógica puede tardar en reflejarse hasta la expiración del ciclo de copias.',
          'de-DE':
            'Backups folgen technischen Zyklen und können Daten begrenzt technisch vorhalten. Logische Löschungen können sich erst nach Ablauf der Backup-Rotation vollständig auswirken.',
        },
      },
      {
        title: { 'en-US': '9. Erasure requests', 'es-ES': '9. Solicitudes de supresión', 'de-DE': '9. Löschanfragen' },
        body: {
          'en-US':
            'Erasure requests are assessed according to Aria’s role, controller instructions, legal duties, rights exercise and technical feasibility.',
          'es-ES':
            'Las solicitudes de eliminación se evaluarán según el papel de Aria, instrucciones del responsable, obligación legal, ejercicio de derechos y viabilidad técnica.',
          'de-DE':
            'Löschanfragen werden nach Rolle von Aria, Weisungen des Verantwortlichen, gesetzlichen Pflichten, Rechtsausübung und technischer Machbarkeit bewertet.',
        },
      },
    ],
  },
  {
    type: 'SUBPROCESSORS_LIST',
    titles: {
      'en-US': 'Subprocessors and Key Third Parties List',
      'es-ES': 'Lista de suboperadores y terceros relevantes',
      'de-DE': 'Liste der Subprozessoren und wesentlichen Dritten',
    },
    summaries: {
      'en-US': 'Category register for legal review — fill in final vendor names, regions and DPAs.',
      'es-ES': 'Registro por categorías para revisión jurídica — completar proveedores finales, regiones y DPAs.',
      'de-DE': 'Kategorienregister zur juristischen Prüfung — endgültige Anbieter, Regionen und AV-Verträge ergänzen.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Objetivo', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This list describes categories of third parties that may process personal data on behalf of Aria or the Customer to operate the platform.',
          'es-ES':
            'Esta lista describe categorías de terceros que pueden tratar datos personales en nombre de Aria o del Cliente para operar la plataforma.',
          'de-DE':
            'Diese Liste beschreibt Kategorien von Dritten, die personenbezogene Daten im Auftrag von Aria oder dem Kunden zur Plattformbetreibung verarbeiten können.',
        },
      },
      {
        title: { 'en-US': '2. Infrastructure and hosting', 'es-ES': '2. Infraestructura y alojamiento', 'de-DE': '2. Infrastruktur und Hosting' },
        body: {
          'en-US':
            'Cloud, servers, databases, storage, CDN, backup, monitoring and security vendors may host or process platform data.',
          'es-ES':
            'Proveedores de nube, servidores, bases de datos, almacenamiento, CDN, copias de seguridad, monitorización y seguridad pueden alojar o procesar datos de la plataforma.',
          'de-DE':
            'Cloud-, Server-, Datenbank-, Speicher-, CDN-, Backup-, Monitoring- und Sicherheitsanbieter können Plattformdaten hosten oder verarbeiten.',
        },
      },
      {
        title: { 'en-US': '3. Communications', 'es-ES': '3. Comunicaciones', 'de-DE': '3. Kommunikation' },
        body: {
          'en-US':
            'Transactional email, SMS, push, messaging and support tools may process contact data and message content.',
          'es-ES':
            'Herramientas de correo transaccional, SMS, push, mensajería y soporte pueden procesar datos de contacto y contenido de mensajes.',
          'de-DE':
            'Transaktions-E-Mail, SMS, Push, Messaging und Support-Tools können Kontaktdaten und Nachrichteninhalte verarbeiten.',
        },
      },
      {
        title: { 'en-US': '4. Maps and location', 'es-ES': '4. Mapas y ubicación', 'de-DE': '4. Karten und Standort' },
        body: {
          'en-US':
            'Mapping, routing, geocoding and address resolution services may process coordinates, addresses and travel context.',
          'es-ES':
            'Servicios de mapas, rutas, geocodificación y resolución de dirección pueden procesar coordenadas, direcciones y contexto de desplazamiento.',
          'de-DE':
            'Karten-, Routing-, Geocoding- und Adressauflösungsdienste können Koordinaten, Adressen und Fahrkontext verarbeiten.',
        },
      },
      {
        title: { 'en-US': '5. AI, OCR and biometrics', 'es-ES': '5. IA, OCR y biometría', 'de-DE': '5. KI, OCR und Biometrie' },
        body: {
          'en-US':
            'AI, OCR, computer vision and facial recognition providers may process images, text, metadata and templates when modules are enabled.',
          'es-ES':
            'Proveedores de IA, OCR, visión por computador y reconocimiento facial pueden procesar imágenes, textos, metadatos y plantillas cuando los módulos estén habilitados.',
          'de-DE':
            'KI-, OCR-, Computer-Vision- und Gesichtserkennungsanbieter können Bilder, Texte, Metadaten und Vorlagen verarbeiten, wenn Module aktiviert sind.',
        },
      },
      {
        title: { 'en-US': '6. Payments and e-signature', 'es-ES': '6. Pagos y firma electrónica', 'de-DE': '6. Zahlungen und E-Signatur' },
        body: {
          'en-US':
            'Payment gateways, invoicing, anti-fraud, e-signature and collections tools may process financial, tax and contractual data.',
          'es-ES':
            'Pasarelas de pago, facturación, antifraude, firma electrónica y cobros pueden procesar datos financieros, fiscales y contractuales.',
          'de-DE':
            'Zahlungsgateways, Rechnungsstellung, Betrugsprävention, E-Signatur und Inkasso können Finanz-, Steuer- und Vertragsdaten verarbeiten.',
        },
      },
      {
        title: { 'en-US': '7. Procurement criteria', 'es-ES': '7. Criterios de contratación', 'de-DE': '7. Auswahlkriterien' },
        body: {
          'en-US':
            'Subprocessors must be assessed for security, confidentiality, purpose, retention, data location, international transfers and compatible contractual obligations.',
          'es-ES':
            'Los suboperadores deben evaluarse en seguridad, confidencialidad, finalidad, retención, ubicación de datos, transferencias internacionales y obligaciones contractuales compatibles.',
          'de-DE':
            'Subprozessoren sind hinsichtlich Sicherheit, Vertraulichkeit, Zweck, Aufbewahrung, Datenstandort, internationaler Übermittlung und vereinbarer Pflichten zu bewerten.',
        },
      },
      {
        title: { 'en-US': '8. Changes', 'es-ES': '8. Cambios', 'de-DE': '8. Änderungen' },
        body: {
          'en-US':
            'Aria may update this list when adding, replacing or removing relevant vendors. Customers may request additional information through contractual channels.',
          'es-ES':
            'Aria puede actualizar esta lista al añadir, sustituir o eliminar proveedores relevantes. Los clientes pueden solicitar información adicional por los canales contractuales.',
          'de-DE':
            'Aria kann diese Liste bei Hinzufügen, Ersetzen oder Entfernen relevanter Anbieter aktualisieren. Kunden können weitere Informationen über vertragliche Kanäle anfordern.',
        },
      },
      {
        title: { 'en-US': '9. Operational table', 'es-ES': '9. Tabla operativa', 'de-DE': '9. Operative Tabelle' },
        body: {
          'en-US':
            '| Category | Vendor | Purpose | Country/Region | Data processed | Notes |\n|---|---|---|---|---|---|\n| Infrastructure | To be completed | Hosting & database | To be completed | Platform data | Review contract |\n| Email | To be completed | Transactional messages | To be completed | Name, email, content | Review DPA |\n| Maps | To be completed | Routing/geocoding | To be completed | Coordinates/address | Review vendor terms |\n| AI/Biometrics | To be completed | Analysis/validation | To be completed | Images/text/templates | Enhanced review |',
          'es-ES':
            '| Categoría | Proveedor | Finalidad | País/Región | Datos tratados | Observaciones |\n|---|---|---|---|---|---|\n| Infraestructura | A completar | Alojamiento y base de datos | A completar | Datos de la plataforma | Revisar contrato |\n| Correo | A completar | Mensajes transaccionales | A completar | Nombre, correo, contenido | Revisar DPA |\n| Mapas | A completar | Rutas/geocodificación | A completar | Coordenadas/dirección | Revisar términos del proveedor |\n| IA/Biometría | A completar | Análisis/validación | A completar | Imágenes/textos/plantillas | Revisión reforzada |',
          'de-DE':
            '| Kategorie | Anbieter | Zweck | Land/Region | Verarbeitete Daten | Hinweise |\n|---|---|---|---|---|---|\n| Infrastruktur | Auszufüllen | Hosting & Datenbank | Auszufüllen | Plattformdaten | Vertrag prüfen |\n| E-Mail | Auszufüllen | Transaktionsnachrichten | Auszufüllen | Name, E-Mail, Inhalt | AV-Vertrag prüfen |\n| Karten | Auszufüllen | Routing/Geocoding | Auszufüllen | Koordinaten/Adresse | Anbieterbedingungen prüfen |\n| KI/Biometrie | Auszufüllen | Analyse/Validierung | Auszufüllen | Bilder/Texte/Vorlagen | Verstärkte Prüfung |',
        },
      },
    ],
  },
  {
    type: 'SLA_SUPPORT_POLICY',
    titles: {
      'en-US': 'SLA, Support and Maintenance Policy',
      'es-ES': 'Política de SLA, soporte y mantenimiento',
      'de-DE': 'Richtlinie zu SLA, Support und Wartung',
    },
    summaries: {
      'en-US': 'Support channels, severities, maintenance windows, exclusions and service credits (if contracted).',
      'es-ES': 'Canales de soporte, severidades, ventanas de mantenimiento, exclusiones y créditos de servicio (si contratados).',
      'de-DE': 'Supportkanäle, Schweregrade, Wartungsfenster, Ausschlüsse und Servicegutschriften (falls vereinbart).',
    },
    sections: [
      {
        title: { 'en-US': '1. Scope', 'es-ES': '1. Alcance', 'de-DE': '1. Geltungsbereich' },
        body: {
          'en-US':
            'This Policy sets support, maintenance and availability parameters for Aria, unless a proposal or agreement states otherwise.',
          'es-ES':
            'Esta Política define parámetros de soporte, mantenimiento y disponibilidad de Aria, salvo condiciones específicas en propuesta o contrato.',
          'de-DE':
            'Diese Richtlinie definiert Support-, Wartungs- und Verfügbarkeitsparameter für Aria, sofern Angebot oder Vertrag nichts anderes regelt.',
        },
      },
      {
        title: { 'en-US': '2. Support channels', 'es-ES': '2. Canales de soporte', 'de-DE': '2. Supportkanäle' },
        body: {
          'en-US':
            'Support may be provided via email, console, chat, ticketing, phone or agreed channels. The Customer must designate authorised contacts and provide information needed for diagnosis.',
          'es-ES':
            'El soporte puede prestarse por correo, panel, chat, tickets, teléfono o canal acordado. El Cliente debe indicar contactos autorizados y la información necesaria para el diagnóstico.',
          'de-DE':
            'Support kann per E-Mail, Konsole, Chat, Ticketsystem, Telefon oder vereinbarten Kanälen erfolgen. Der Kunde benennt autorisierte Ansprechpartner und liefert Diagnoseinformationen.',
        },
      },
      {
        title: { 'en-US': '3. Severities', 'es-ES': '3. Severidades', 'de-DE': '3. Schweregrade' },
        body: {
          'en-US':
            '**Critical:** broad production outage. **High:** essential function unavailable without reasonable workaround. **Medium:** partial failure with workaround. **Low:** questions, tweaks, cosmetic issues.',
          'es-ES':
            '**Crítica:** indisponibilidad amplia de producción. **Alta:** función esencial no disponible sin contorno razonable. **Media:** fallo parcial con contorno. **Baja:** dudas, ajustes o problemas cosméticos.',
          'de-DE':
            '**Kritisch:** breiter Produktionsausfall. **Hoch:** wesentliche Funktion ohne vertretbaren Workaround nicht verfügbar. **Mittel:** Teilfehler mit Workaround. **Niedrig:** Fragen, Anpassungen, kosmetische Themen.',
        },
      },
      {
        title: { 'en-US': '4. Response times', 'es-ES': '4. Tiempos de respuesta', 'de-DE': '4. Reaktionszeiten' },
        body: {
          'en-US':
            'Initial response targets depend on plan and severity. Initial response is not final resolution, which depends on complexity, third parties, logs, reproduction and maintenance windows.',
          'es-ES':
            'Los objetivos de respuesta inicial dependen del plan y la severidad. La respuesta inicial no es resolución final, que depende de complejidad, terceros, registros, reproducción y ventanas de mantenimiento.',
          'de-DE':
            'Erstreaktionsziele hängen von Plan und Schweregrad ab. Erstreaktion ist nicht die endgültige Lösung; diese hängt von Komplexität, Dritten, Logs, Reproduzierbarkeit und Wartungsfenstern ab.',
        },
      },
      {
        title: { 'en-US': '5. Availability', 'es-ES': '5. Disponibilidad', 'de-DE': '5. Verfügbarkeit' },
        body: {
          'en-US':
            'Aria targets commercially reasonable high availability. Measurements may exclude scheduled maintenance, third-party failures, internet, devices, Customer misconfiguration, force majeure and misuse.',
          'es-ES':
            'Aria busca alta disponibilidad comercialmente razonable. Las mediciones pueden excluir mantenimientos programados, fallos de terceros, internet, dispositivos, mala configuración del Cliente, fuerza mayor y uso indebido.',
          'de-DE':
            'Aria strebt eine wirtschaftlich angemessene hohe Verfügbarkeit an. Messungen können geplante Wartung, Drittfehler, Internet, Geräte, Fehlkonfiguration des Kunden, höhere Gewalt und Missbrauch ausschließen.',
        },
      },
      {
        title: { 'en-US': '6. Maintenance', 'es-ES': '6. Mantenimiento', 'de-DE': '6. Wartung' },
        body: {
          'en-US':
            'Maintenance may be scheduled with reasonable notice or performed as emergency work for security, critical fixes or stability. Updates may change interfaces and features.',
          'es-ES':
            'El mantenimiento puede programarse con aviso razonable o ser emergencial por seguridad, corrección crítica o estabilidad. Las actualizaciones pueden cambiar interfaces y funciones.',
          'de-DE':
            'Wartung kann mit angemessener Vorankündigung geplant oder notfallmäßig aus Sicherheit, kritischen Fixes oder Stabilität erfolgen. Updates können Oberflächen und Funktionen ändern.',
        },
      },
      {
        title: { 'en-US': '7. Backups and restore', 'es-ES': '7. Copias y restauración', 'de-DE': '7. Backups und Wiederherstellung' },
        body: {
          'en-US':
            'Backups follow Aria’s operational policy. Restore feasibility depends on technical scope, recovery point and impact on recent data.',
          'es-ES':
            'Las copias siguen la política operativa de Aria. La viabilidad de restauración depende del alcance técnico, punto de recuperación e impacto en datos recientes.',
          'de-DE':
            'Backups folgen der operativen Richtlinie von Aria. Die Machbarkeit einer Wiederherstellung hängt von technischem Umfang, Recovery Point und Auswirkungen auf aktuelle Daten ab.',
        },
      },
      {
        title: { 'en-US': '8. Exclusions', 'es-ES': '8. Exclusiones', 'de-DE': '8. Ausschlüsse' },
        body: {
          'en-US':
            'Issues caused by compromised credentials, unauthorised customisations, Customer networks, incompatible devices, third-party integrations, incorrect data or use outside documentation are out of scope.',
          'es-ES':
            'Quedan fuera problemas por credenciales comprometidas, personalizaciones no autorizadas, redes del Cliente, dispositivos incompatibles, integraciones de terceros, datos incorrectos o uso fuera de la documentación.',
          'de-DE':
            'Ausgeschlossen sind Probleme durch kompromittierte Zugangsdaten, unbefugte Anpassungen, Kundennetze, inkompatible Geräte, Drittintegrationen, falsche Daten oder Nutzung außerhalb der Dokumentation.',
        },
      },
      {
        title: { 'en-US': '9. Service credits', 'es-ES': '9. Créditos de servicio', 'de-DE': '9. Servicegutschriften' },
        body: {
          'en-US':
            'Credits, penalties or remedies apply only if expressly agreed in contract, including limits, calculation method and claim procedure.',
          'es-ES':
            'Créditos, multas o remedios solo aplican si están expresamente previstos en el contrato, con límites, método de cálculo y procedimiento de solicitud.',
          'de-DE':
            'Gutschriften, Strafen oder Abhilfen gelten nur, wenn sie ausdrücklich vertraglich vereinbart sind, einschließlich Grenzen, Berechnungsmethode und Antragsverfahren.',
        },
      },
    ],
  },
  {
    type: 'BILLING_REFUND_POLICY',
    titles: {
      'en-US': 'Billing, Cancellation and Refund Policy',
      'es-ES': 'Política de facturación, cancelación y reembolso',
      'de-DE': 'Richtlinie zu Abrechnung, Kündigung und Erstattung',
    },
    summaries: {
      'en-US': 'Monthly/annual plans, trial, upgrade/downgrade, delinquency, taxes, cancellation and refunds.',
      'es-ES': 'Planes mensuales/anuales, trial, upgrade/downgrade, morosidad, impuestos, cancelación y reembolsos.',
      'de-DE': 'Monats-/Jahrespläne, Testphase, Upgrade/Downgrade, Zahlungsverzug, Steuern, Kündigung und Erstattungen.',
    },
    sections: [
      {
        title: { 'en-US': '1. Plans and billing', 'es-ES': '1. Planes y facturación', 'de-DE': '1. Pläne und Abrechnung' },
        body: {
          'en-US':
            'Aria may offer free, trial, monthly, annual, enterprise or customised plans. Prices, limits, taxes, currency and payment methods are defined at purchase or in the console.',
          'es-ES':
            'Aria puede ofrecer planes gratuitos, trial, mensuales, anuales, enterprise o personalizados. Precios, límites, impuestos, moneda y forma de pago se definen en la contratación o en el panel.',
          'de-DE':
            'Aria kann kostenlose, Test-, Monats-, Jahres-, Enterprise- oder maßgeschneiderte Pläne anbieten. Preise, Limits, Steuern, Währung und Zahlungsarten werden beim Kauf oder in der Konsole festgelegt.',
        },
      },
      {
        title: { 'en-US': '2. Cycles and renewal', 'es-ES': '2. Ciclos y renovación', 'de-DE': '2. Zyklen und Verlängerung' },
        body: {
          'en-US':
            'Subscriptions renew automatically at the end of each cycle unless cancelled or otherwise agreed. The Customer must keep a valid payment method on file.',
          'es-ES':
            'Las suscripciones se renuevan automáticamente al final del ciclo, salvo cancelación u otra condición contractual. El Cliente debe mantener un método de pago válido.',
          'de-DE':
            'Abonnements verlängern sich am Zyklusende automatisch, sofern nicht gekündigt oder anders vereinbart. Der Kunde muss ein gültiges Zahlungsmittel hinterlegen.',
        },
      },
      {
        title: { 'en-US': '3. Trial', 'es-ES': '3. Trial', 'de-DE': '3. Testphase' },
        body: {
          'en-US':
            'Trials may include limitations, require a card on file or auto-convert to a paid plan if disclosed at signup.',
          'es-ES':
            'Los periodos de prueba pueden tener limitaciones, exigir tarjeta o convertirse automáticamente en plan de pago si se informó en el registro.',
          'de-DE':
            'Testphasen können Einschränkungen haben, eine Karte erfordern oder – wenn bei der Anmeldung mitgeteilt – automatisch in einen kostenpflichtigen Plan wechseln.',
        },
      },
      {
        title: { 'en-US': '4. Upgrade and downgrade', 'es-ES': '4. Upgrade y downgrade', 'de-DE': '4. Upgrade und Downgrade' },
        body: {
          'en-US':
            'Upgrades may bill prorated amounts immediately or on the next cycle. Downgrades may apply next cycle and require fitting within lower limits.',
          'es-ES':
            'Los upgrades pueden generar cobro prorrateado inmediato o en el siguiente ciclo. Los downgrades pueden aplicarse en el ciclo siguiente y exigen ajuste a límites inferiores.',
          'de-DE':
            'Upgrades können sofort anteilig oder im nächsten Zyklus berechnet werden. Downgrades können im nächsten Zyklus wirken und erfordern Anpassung an niedrigere Limits.',
        },
      },
      {
        title: { 'en-US': '5. Delinquency', 'es-ES': '5. Morosidad', 'de-DE': '5. Zahlungsverzug' },
        body: {
          'en-US':
            'Failed payments may trigger retries, notices, suspension, feature restrictions, blocking of new capture or termination, while data retention follows contract and policy.',
          'es-ES':
            'El impago puede generar reintentos, notificaciones, suspensión, restricción de funciones, bloqueo de nuevas capturas o terminación, conservándose datos según contrato y política.',
          'de-DE':
            'Fehlgeschlagene Zahlungen können Wiederholungen, Hinweise, Sperrung, Funktionsbeschränkungen, Blockierung neuer Erfassung oder Kündigung auslösen; Datenaufbewahrung folgt Vertrag und Richtlinie.',
        },
      },
      {
        title: { 'en-US': '6. Cancellation', 'es-ES': '6. Cancelación', 'de-DE': '6. Kündigung' },
        body: {
          'en-US':
            'The Customer may cancel through available channels. Cancellation stops future renewals but does not automatically waive accrued charges, pending invoices or retention-bound data.',
          'es-ES':
            'El Cliente puede cancelar por los canales disponibles. La cancelación detiene renovaciones futuras, pero no elimina automáticamente cargos vencidos, facturas pendientes o datos sujetos a retención.',
          'de-DE':
            'Der Kunde kann über verfügbare Kanäle kündigen. Die Kündigung stoppt künftige Verlängerungen, hebt aber nicht automatisch fällige Gebühren, offene Rechnungen oder aufbewahrungspflichtige Daten auf.',
        },
      },
      {
        title: { 'en-US': '7. Refunds', 'es-ES': '7. Reembolsos', 'de-DE': '7. Erstattungen' },
        body: {
          'en-US':
            'Unless required by law or a specific agreement, fees paid are generally non-refundable for partial use, early cancellation, downgrade or unused features.',
          'es-ES':
            'Salvo exigencia legal o contrato específico, los importes pagados no suelen ser reembolsables por uso parcial, cancelación anticipada, downgrade o funciones no usadas.',
          'de-DE':
            'Sofern nicht gesetzlich oder ausdrücklich vereinbart, sind gezahlte Gebühren in der Regel nicht erstattungsfähig bei Teilenutzung, vorzeitiger Kündigung, Downgrade oder ungenutzten Funktionen.',
        },
      },
      {
        title: { 'en-US': '8. Taxes', 'es-ES': '8. Impuestos', 'de-DE': '8. Steuern' },
        body: {
          'en-US':
            'Amounts may be subject to taxes, fees, withholdings and charges under applicable law. The Customer is responsible for accurate tax information.',
          'es-ES':
            'Los importes pueden estar sujetos a impuestos, tasas, retenciones y cargos conforme a la ley aplicable. El Cliente es responsable de la información fiscal correcta.',
          'de-DE':
            'Beträge können nach geltendem Recht Steuern, Gebühren, Einbehalte und Entgelte unterliegen. Der Kunde ist für korrekte Steuerangaben verantwortlich.',
        },
      },
      {
        title: { 'en-US': '9. Billing disputes', 'es-ES': '9. Disputas de facturación', 'de-DE': '9. Abrechnungsstreitigkeiten' },
        body: {
          'en-US':
            'Disputes must be submitted within a reasonable period with invoice identification and rationale. Opening a dispute does not automatically suspend undisputed obligations.',
          'es-ES':
            'Las disputas deben enviarse en plazo razonable con identificación de factura y justificación. Abrir una disputa no suspende automáticamente obligaciones no disputadas.',
          'de-DE':
            'Streitigkeiten sind innerhalb angemessener Frist mit Rechnungsbezug und Begründung einzureichen. Ein Streit setzt nicht automatisch unbestrittene Verpflichtungen aus.',
        },
      },
    ],
  },
  {
    type: 'PROVIDER_TERMS',
    titles: {
      'en-US': 'Service Provider Terms',
      'es-ES': 'Términos del prestador de servicios',
      'de-DE': 'Bedingungen für Dienstleister',
    },
    summaries: {
      'en-US': 'Technicians/contractors: tenant invitations, conduct, documents, ratings, independence and suspension.',
      'es-ES': 'Técnicos/contratistas: invitaciones del tenant, conducta, documentos, evaluaciones, independencia y suspensión.',
      'de-DE': 'Techniker/Auftragnehmer: Tenant-Einladungen, Verhalten, Dokumente, Bewertungen, Unabhängigkeit und Sperrung.',
    },
    sections: [
      {
        title: { 'en-US': '1. Scope', 'es-ES': '1. Alcance', 'de-DE': '1. Geltungsbereich' },
        body: {
          'en-US':
            'These Terms govern registration and use of Aria by contractors, independent technicians, third-party companies and professionals invited by tenants to perform services.',
          'es-ES':
            'Estos Términos regulan el registro y uso de Aria por contratistas, técnicos autónomos, empresas terceras y profesionales invitados por tenants para ejecutar servicios.',
          'de-DE':
            'Diese Bedingungen regeln Registrierung und Nutzung von Aria durch Auftragnehmer, selbstständige Techniker, Drittunternehmen und von Tenants eingeladene Fachkräfte zur Leistungserbringung.',
        },
      },
      {
        title: { 'en-US': '2. Independence', 'es-ES': '2. Independencia', 'de-DE': '2. Unabhängigkeit' },
        body: {
          'en-US':
            'Unless expressly agreed otherwise, Aria is a technology platform and is not the employer, direct principal or guarantor of services between contractor and tenant/end customer.',
          'es-ES':
            'Salvo acuerdo expreso en contrario, Aria es una plataforma tecnológica y no es empleadora, tomadora directa ni garante de los servicios entre contratista y tenant/cliente final.',
          'de-DE':
            'Sofern nicht ausdrücklich anders vereinbart, ist Aria eine Technologieplattform und weder Arbeitgeber, direkter Auftraggeber noch Garant für Leistungen zwischen Auftragnehmer und Tenant/Endkunde.',
        },
      },
      {
        title: { 'en-US': '3. Registration and documents', 'es-ES': '3. Registro y documentos', 'de-DE': '3. Registrierung und Unterlagen' },
        body: {
          'en-US':
            'The contractor must provide truthful information, valid documents, certifications, professional data, availability, service regions and any evidence requested.',
          'es-ES':
            'El contratista debe proporcionar información veraz, documentos válidos, certificaciones, datos profesionales, disponibilidad, región de servicio y evidencias solicitadas.',
          'de-DE':
            'Der Auftragnehmer muss wahre Angaben, gültige Dokumente, Zertifizierungen, Berufsdaten, Verfügbarkeit, Servicegebiete und angeforderte Nachweise liefern.',
        },
      },
      {
        title: { 'en-US': '4. Invitations and affiliations', 'es-ES': '4. Invitaciones y afiliaciones', 'de-DE': '4. Einladungen und Zuordnung' },
        body: {
          'en-US':
            'Tenants may invite, approve, suspend or remove contractors from their operation. Global status in Aria does not guarantee engagement, minimum demand or exclusivity.',
          'es-ES':
            'Los tenants pueden invitar, aprobar, suspender o eliminar contratistas de su operación. El estado global en Aria no garantiza contratación, demanda mínima ni exclusividad.',
          'de-DE':
            'Tenants können Auftragnehmer einladen, freigeben, sperren oder aus ihrem Betrieb entfernen. Ein globaler Status in Aria garantiert weder Einsatz, Mindestnachfrage noch Exklusivität.',
        },
      },
      {
        title: { 'en-US': '5. Professional conduct', 'es-ES': '5. Conducta profesional', 'de-DE': '5. Professionelles Verhalten' },
        body: {
          'en-US':
            'The contractor must comply with laws, technical standards, occupational safety, confidentiality, tenant policies, agreed schedules, quality standards and respect for end customers.',
          'es-ES':
            'El contratista debe cumplir leyes, normas técnicas, seguridad laboral, confidencialidad, políticas del tenant, horarios acordados, estándares de calidad y respeto a clientes finales.',
          'de-DE':
            'Der Auftragnehmer muss Gesetze, technische Normen, Arbeitssicherheit, Vertraulichkeit, Tenant-Richtlinien, vereinbarte Zeiten, Qualitätsstandards und Respekt gegenüber Endkunden einhalten.',
        },
      },
      {
        title: { 'en-US': '6. App usage', 'es-ES': '6. Uso de la app', 'de-DE': '6. App-Nutzung' },
        body: {
          'en-US':
            'The contractor must record tasks, photos, checklists, location, materials, expenses, time tracking or evidence as instructed under valid policies and accepted documents.',
          'es-ES':
            'El contratista debe registrar tareas, fotos, checklists, ubicación, materiales, gastos, jornada o evidencias según instrucciones válidas y documentos aceptados.',
          'de-DE':
            'Der Auftragnehmer muss Aufgaben, Fotos, Checklisten, Standort, Material, Ausgaben, Zeiterfassung oder Nachweise gemäß gültigen Anweisungen und akzeptierten Dokumenten erfassen.',
        },
      },
      {
        title: { 'en-US': '7. Ratings and disputes', 'es-ES': '7. Evaluaciones y disputas', 'de-DE': '7. Bewertungen und Streitigkeiten' },
        body: {
          'en-US':
            'Services may generate ratings, metrics, action plans or disputes. The contractor may submit justifications or contest ratings when flows are available.',
          'es-ES':
            'Los servicios pueden generar evaluaciones, métricas, planes de acción o disputas. El contratista podrá presentar justificativas o impugnar evaluaciones cuando existan flujos.',
          'de-DE':
            'Leistungen können Bewertungen, Kennzahlen, Maßnahmenpläne oder Streitigkeiten erzeugen. Der Auftragnehmer kann Begründungen einreichen oder Bewertungen anfechten, sofern Prozesse existieren.',
        },
      },
      {
        title: { 'en-US': '8. Payments', 'es-ES': '8. Pagos', 'de-DE': '8. Zahlungen' },
        body: {
          'en-US':
            'Payments for services, reimbursements, pass-through fees or commissions depend on agreements between contractor and tenant, and are not guaranteed by Aria unless expressly assumed.',
          'es-ES':
            'Los pagos por servicios, reembolsos, repases o comisiones dependen del acuerdo entre contratista y tenant, y no están garantizados por Aria salvo asunción expresa.',
          'de-DE':
            'Vergütungen für Leistungen, Erstattungen, Weiterbelastungen oder Provisionen richten sich nach Vereinbarungen zwischen Auftragnehmer und Tenant und sind von Aria nicht garantiert, außer ausdrücklich übernommen.',
        },
      },
      {
        title: { 'en-US': '9. Suspension', 'es-ES': '9. Suspensión', 'de-DE': '9. Sperrung' },
        body: {
          'en-US':
            'Access may be suspended for fraud, invalid documentation, security risk, policy violations, misuse, tenant request or legal order.',
          'es-ES':
            'El acceso puede suspenderse por fraude, documentación inválida, riesgo de seguridad, violación de políticas, uso indebido, solicitud del tenant u orden legal.',
          'de-DE':
            'Der Zugang kann bei Betrug, ungültigen Unterlagen, Sicherheitsrisiko, Richtlinienverstößen, Missbrauch, Tenant-Anfrage oder behördlicher Anordnung gesperrt werden.',
        },
      },
      {
        title: { 'en-US': '10. Confidentiality', 'es-ES': '10. Confidencialidad', 'de-DE': '10. Vertraulichkeit' },
        body: {
          'en-US':
            'The contractor must protect customer, asset, route, credential, document and personal data accessed through the platform.',
          'es-ES':
            'El contratista debe proteger información de clientes, activos, rutas, credenciales, documentos y datos personales accedidos por la plataforma.',
          'de-DE':
            'Der Auftragnehmer muss Kunden-, Vermögens-, Routen-, Zugangs-, Dokumenten- und personenbezogene Daten schützen, auf die über die Plattform zugegriffen wird.',
        },
      },
    ],
  },
  {
    type: 'KYC_NOTICE',
    titles: {
      'en-US': 'Registration, Identity Verification and KYC Notice',
      'es-ES': 'Aviso de registro, verificación de identidad y KYC',
      'de-DE': 'Hinweis zu Registrierung, Identitätsprüfung und KYC',
    },
    summaries: {
      'en-US': 'Contractor onboarding: documents, verification, anti-fraud, human review and retention.',
      'es-ES': 'Onboarding de contratistas: documentos, verificación, antifraude, revisión humana y retención.',
      'de-DE': 'Contractor-Onboarding: Dokumente, Prüfung, Betrugsprävention, menschliche Prüfung und Aufbewahrung.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Finalidad', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Notice explains processing of data for registration, identity verification, professional enablement, anti-fraud, security and approval of contractors in Aria.',
          'es-ES':
            'Este Aviso explica el tratamiento de datos para registro, verificación de identidad, habilitación profesional, antifraude, seguridad y aprobación de contratistas en Aria.',
          'de-DE':
            'Dieser Hinweis erläutert die Verarbeitung von Daten zur Registrierung, Identitätsprüfung, fachlichen Freigabe, Betrugsprävention, Sicherheit und Freigabe von Auftragnehmern bei Aria.',
        },
      },
      {
        title: { 'en-US': '2. Data collected', 'es-ES': '2. Datos recogidos', 'de-DE': '2. Erhobene Daten' },
        body: {
          'en-US':
            'We may collect name, email, phone, tax ID, address, photo, ID document, certifications, professional records, availability, regions, experience, banking data where applicable and signature evidence.',
          'es-ES':
            'Podemos recoger nombre, correo, teléfono, CPF/CNPJ, dirección, foto, documento de identidad, certificaciones, registros profesionales, disponibilidad, regiones, experiencia, datos bancarios cuando aplique y evidencias de firma.',
          'de-DE':
            'Wir können Name, E-Mail, Telefon, Steuer-ID, Adresse, Foto, Ausweis, Zertifizierungen, Berufsnachweise, Verfügbarkeit, Regionen, Erfahrung, Bankdaten (falls zutreffend) und Signaturnachweise erheben.',
        },
      },
      {
        title: { 'en-US': '3. Verification', 'es-ES': '3. Verificaciones', 'de-DE': '3. Prüfungen' },
        body: {
          'en-US':
            'Aria or the tenant may verify document consistency, certification validity, identity, duplication, risk, operational history and information provided by the contractor.',
          'es-ES':
            'Aria o el tenant pueden verificar consistencia documental, validez de certificaciones, identidad, duplicidad, riesgo, historial operativo e información proporcionada por el contratista.',
          'de-DE':
            'Aria oder der Tenant können Dokumentenkonsistenz, Gültigkeit von Nachweisen, Identität, Duplikate, Risiko, Betriebshistorie und Angaben des Auftragnehmers prüfen.',
        },
      },
      {
        title: { 'en-US': '4. Legal bases', 'es-ES': '4. Bases legales', 'de-DE': '4. Rechtsgrundlagen' },
        body: {
          'en-US':
            'Bases may include contract performance, pre-contractual steps, legitimate interests, fraud prevention, legal compliance, regular exercise of rights and consent where necessary.',
          'es-ES':
            'Las bases pueden incluir ejecución de contrato, medidas precontractuales, interés legítimo, prevención de fraude, cumplimiento legal, ejercicio regular de derechos y consentimiento cuando sea necesario.',
          'de-DE':
            'Grundlagen können Vertragserfüllung, vorvertragliche Maßnahmen, berechtigtes Interesse, Betrugsprävention, gesetzliche Compliance, Rechtsausübung und gegebenenfalls Einwilligung umfassen.',
        },
      },
      {
        title: { 'en-US': '5. Decision and review', 'es-ES': '5. Decisión y revisión', 'de-DE': '5. Entscheidung und Prüfung' },
        body: {
          'en-US':
            'Approval, rejection or requests for changes may involve human review. The contractor may be asked to correct data or submit additional documents.',
          'es-ES':
            'La aprobación, rechazo o solicitud de cambios puede implicar revisión humana. Se puede pedir al contratista corregir datos o enviar documentos adicionales.',
          'de-DE':
            'Freigabe, Ablehnung oder Änderungsanfragen können eine menschliche Prüfung umfassen. Der Auftragnehmer kann aufgefordert werden, Daten zu korrigieren oder weitere Unterlagen einzureichen.',
        },
      },
      {
        title: { 'en-US': '6. Sharing', 'es-ES': '6. Compartición', 'de-DE': '6. Weitergabe' },
        body: {
          'en-US':
            'Data may be shared with tenants that invite or assess the contractor, KYC providers, e-signature, storage, support, authorities and necessary subprocessors.',
          'es-ES':
            'Los datos pueden compartirse con tenants que inviten o evalúen al contratista, proveedores de KYC, firma electrónica, almacenamiento, soporte, autoridades y suboperadores necesarios.',
          'de-DE':
            'Daten können an einladende oder prüfende Tenants, KYC-Anbieter, E-Signatur, Speicher, Support, Behörden und erforderliche Subprozessoren weitergegeben werden.',
        },
      },
      {
        title: { 'en-US': '7. Retention', 'es-ES': '7. Conservación', 'de-DE': '7. Aufbewahrung' },
        body: {
          'en-US':
            'KYC data may be kept while the relationship is active and for additional periods needed for audit, fraud prevention, legal duties or defence of rights.',
          'es-ES':
            'Los datos de KYC pueden conservarse mientras exista relación activa y por periodo adicional necesario para auditoría, prevención de fraude, obligación legal o defensa de derechos.',
          'de-DE':
            'KYC-Daten können während der aktiven Beziehung und darüber hinaus für Audit, Betrugsprävention, gesetzliche Pflichten oder Rechtsverteidigung aufbewahrt werden.',
        },
      },
      {
        title: { 'en-US': '8. Truthfulness', 'es-ES': '8. Veracidad', 'de-DE': '8. Wahrhaftigkeit' },
        body: {
          'en-US':
            'Submitting false data, forged documents or third-party information without authorisation may lead to rejection, suspension, tenant notification and legal measures.',
          'es-ES':
            'Enviar datos falsos, documentos falsificados o información de terceros sin autorización puede generar rechazo, suspensión, comunicación al tenant y medidas legales.',
          'de-DE':
            'Falsche Angaben, gefälschte Dokumente oder Daten Dritter ohne Autorisierung können zu Ablehnung, Sperrung, Information des Tenants und rechtlichen Schritten führen.',
        },
      },
    ],
  },
  {
    type: 'ACCEPTABLE_USE_POLICY',
    titles: {
      'en-US': 'Acceptable Use Policy',
      'es-ES': 'Política de uso aceptable',
      'de-DE': 'Richtlinie zur akzeptablen Nutzung',
    },
    summaries: {
      'en-US': 'Prohibited conduct: security, limits, personal data, AI, integrations and enforcement.',
      'es-ES': 'Conductas prohibidas: seguridad, límites, datos personales, IA, integraciones y cumplimiento.',
      'de-DE': 'Verbotenes Verhalten: Sicherheit, Grenzen, personenbezogene Daten, KI, Integrationen und Durchsetzung.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Objetivo', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Policy sets minimum acceptable use rules to protect Aria, customers, users, contractors, data subjects and third parties.',
          'es-ES':
            'Esta Política define reglas mínimas de uso aceptable para proteger a Aria, sus clientes, usuarios, contratistas, titulares de datos y terceros.',
          'de-DE':
            'Diese Richtlinie legt Mindestregeln für eine zulässige Nutzung fest, um Aria, Kunden, Nutzer, Auftragnehmer, Betroffene und Dritte zu schützen.',
        },
      },
      {
        title: { 'en-US': '2. Security', 'es-ES': '2. Seguridad', 'de-DE': '2. Sicherheit' },
        body: {
          'en-US':
            'You must not attempt unauthorised access, port scanning, exploit vulnerabilities, bypass authentication, share credentials, run abusive bots, introduce malware or disrupt infrastructure.',
          'es-ES':
            'Está prohibido intentar acceso no autorizado, escanear puertos, explotar vulnerabilidades, eludir autenticación, compartir credenciales, usar bots abusivos, introducir malware o interferir en la infraestructura.',
          'de-DE':
            'Unbefugter Zugriff, Portscans, Ausnutzen von Schwachstellen, Umgehung der Authentifizierung, Teilen von Zugangsdaten, missbräuchliche Bots, Schadsoftware oder Störung der Infrastruktur sind untersagt.',
        },
      },
      {
        title: { 'en-US': '3. Data and privacy', 'es-ES': '3. Datos y privacidad', 'de-DE': '3. Daten und Privatsphäre' },
        body: {
          'en-US':
            'You must not collect, upload, share or process personal data without adequate legal basis, transparency and authorisation, or use the platform for abusive or discriminatory surveillance.',
          'es-ES':
            'Está prohibido recoger, cargar, compartir o tratar datos personales sin base legal, transparencia y autorización adecuadas, o usar la plataforma para vigilancia abusiva o discriminatoria.',
          'de-DE':
            'Das Erheben, Hochladen, Teilen oder Verarbeiten personenbezogener Daten ohne angemessene Rechtsgrundlage, Transparenz und Autorisierung sowie missbräuchliche oder diskriminierende Überwachung sind untersagt.',
        },
      },
      {
        title: { 'en-US': '4. Prohibited content', 'es-ES': '4. Contenido prohibido', 'de-DE': '4. Verbotene Inhalte' },
        body: {
          'en-US':
            'Illegal, fraudulent, discriminatory, defamatory, unlawfully violent or sexual content, IP violations, trade secret violations, or content breaching professional rules is prohibited.',
          'es-ES':
            'Se prohíbe contenido ilícito, fraudulento, discriminatorio, difamatorio, sexual ilegal, violento ilegal, que viole propiedad intelectual, secretos empresariales o normas profesionales.',
          'de-DE':
            'Rechtswidrige, betrügerische, diskriminierende, diffamierende, rechtswidrige Gewalt- oder Sexualinhalte, Verletzungen von IP, Geschäftsgeheimnissen oder Berufsregeln sind verboten.',
        },
      },
      {
        title: { 'en-US': '5. AI and automation', 'es-ES': '5. IA y automatización', 'de-DE': '5. KI und Automatisierung' },
        body: {
          'en-US':
            'AI or automation must not be used for fraud, manipulation, discrimination, unlawful decisions, mass scraping, spam, social engineering or harmful content generation.',
          'es-ES':
            'Está prohibido usar IA o automatización para fraude, manipulación, discriminación, decisiones ilegales, extracción masiva, spam, ingeniería social o generación de contenido dañino.',
          'de-DE':
            'KI oder Automatisierung dürfen nicht für Betrug, Manipulation, Diskriminierung, rechtswidrige Entscheidungen, Massenabfragen, Spam, Social Engineering oder schädliche Inhaltserzeugung genutzt werden.',
        },
      },
      {
        title: { 'en-US': '6. Platform limits', 'es-ES': '6. Límites de la plataforma', 'de-DE': '6. Plattformgrenzen' },
        body: {
          'en-US':
            'Users must not bypass quotas, technical limits, rate limits, storage, licences, paid modules, logs, audit or anti-fraud mechanisms.',
          'es-ES':
            'No se deben eludir cuotas, límites técnicos, rate limits, almacenamiento, licencias, módulos de pago, registros, auditoría o mecanismos antifraude.',
          'de-DE':
            'Nutzer dürfen Kontingente, technische Limits, Rate-Limits, Speicher, Lizenzen, kostenpflichtige Module, Logs, Audit- oder Anti-Fraud-Mechanismen nicht umgehen.',
        },
      },
      {
        title: { 'en-US': '7. Integrations', 'es-ES': '7. Integraciones', 'de-DE': '7. Integrationen' },
        body: {
          'en-US':
            'Integrations must follow documentation, keys, secrets, permissions and applicable laws. The Customer remains responsible for externally connected systems.',
          'es-ES':
            'Las integraciones deben respetar documentación, claves, secretos, permisos y leyes aplicables. El Cliente responde por sistemas externos conectados a su cuenta.',
          'de-DE':
            'Integrationen müssen Dokumentation, Schlüssel, Geheimnisse, Berechtigungen und anwendbares Recht einhalten. Der Kunde bleibt für extern angebundene Systeme verantwortlich.',
        },
      },
      {
        title: { 'en-US': '8. Consequences', 'es-ES': '8. Consecuencias', 'de-DE': '8. Folgen' },
        body: {
          'en-US':
            'Violations may lead to content removal, blocking, suspension, termination, Customer notice, evidence preservation, damages and authority reporting where necessary.',
          'es-ES':
            'Las violaciones pueden implicar eliminación de contenido, bloqueo, suspensión, terminación, aviso al Cliente, preservación de evidencias, daños y comunicación a autoridades cuando proceda.',
          'de-DE':
            'Verstöße können zu Entfernung von Inhalten, Sperrung, Aussetzung, Kündigung, Kundeninformation, Beweissicherung, Schadensersatz und Meldungen an Behörden führen, sofern erforderlich.',
        },
      },
    ],
  },
  {
    type: 'SECURITY_POLICY',
    titles: {
      'en-US': 'Information Security Policy',
      'es-ES': 'Política de seguridad de la información',
      'de-DE': 'Informationssicherheitsrichtlinie',
    },
    summaries: {
      'en-US': 'Public/contractual security: controls, shared responsibility, incidents, backups and vulnerability reporting.',
      'es-ES': 'Seguridad pública/contratual: controles, responsabilidad compartida, incidentes, copias e informe de vulnerabilidades.',
      'de-DE': 'Öffentliche/vertragliche Sicherheit: Kontrollen, geteilte Verantwortung, Vorfälle, Backups und Schwachstellenmeldung.',
    },
    sections: [
      {
        title: { 'en-US': '1. Purpose', 'es-ES': '1. Objetivo', 'de-DE': '1. Zweck' },
        body: {
          'en-US':
            'This Policy describes Aria security practices and responsibilities shared with Customers and users.',
          'es-ES':
            'Esta Política describe prácticas de seguridad de Aria y responsabilidades compartidas con Clientes y usuarios.',
          'de-DE':
            'Diese Richtlinie beschreibt Sicherheitspraktiken von Aria und die gemeinsame Verantwortung mit Kunden und Nutzern.',
        },
      },
      {
        title: { 'en-US': '2. Technical controls', 'es-ES': '2. Controles técnicos', 'de-DE': '2. Technische Kontrollen' },
        body: {
          'en-US':
            'Aria uses authentication, role-based authorisation, logical tenant segregation, logs, encryption in transit, backups, secrets management, hardening, monitoring and periodic access reviews as needed.',
          'es-ES':
            'Aria utiliza autenticación, autorización por roles, segregación lógica por tenant, registros, cifrado en tránsito, copias, gestión de secretos, hardening, monitorización y revisiones periódicas de acceso según necesidad.',
          'de-DE':
            'Aria nutzt Authentifizierung, rollenbasierte Autorisierung, logische Mandantentrennung, Protokolle, Verschlüsselung während der Übertragung, Backups, Secrets-Management, Hardening, Monitoring und periodische Zugriffsprüfungen nach Bedarf.',
        },
      },
      {
        title: { 'en-US': '3. Secure development', 'es-ES': '3. Desarrollo seguro', 'de-DE': '3. Sichere Entwicklung' },
        body: {
          'en-US':
            'Material changes undergo technical review, proportional testing, version control and controlled deployment. Known vulnerabilities are triaged by risk.',
          'es-ES':
            'Los cambios relevantes pasan por revisión técnica, pruebas proporcionales, control de versiones y despliegue controlado. Las vulnerabilidades conocidas se priorizan por riesgo.',
          'de-DE':
            'Wesentliche Änderungen durchlaufen technische Reviews, proportionale Tests, Versionskontrolle und kontrolliertes Deployment. Bekannte Schwachstellen werden nach Risiko priorisiert.',
        },
      },
      {
        title: { 'en-US': '4. Customer responsibilities', 'es-ES': '4. Responsabilidades del Cliente', 'de-DE': '4. Pflichten des Kunden' },
        body: {
          'en-US':
            'The Customer must manage users, passwords, devices, networks, permissions, integrations, internal policies, training and timely removal of inappropriate access.',
          'es-ES':
            'El Cliente debe gestionar usuarios, contraseñas, dispositivos, redes, permisos, integraciones, políticas internas, formación y eliminación oportuna de accesos indebidos.',
          'de-DE':
            'Der Kunde verwaltet Nutzer, Passwörter, Geräte, Netze, Berechtigungen, Integrationen, interne Richtlinien, Schulungen und zeitnahe Entfernung unangemessener Zugriffe.',
        },
      },
      {
        title: { 'en-US': '5. Incidents', 'es-ES': '5. Incidentes', 'de-DE': '5. Vorfälle' },
        body: {
          'en-US':
            'Security events are investigated, mitigated and communicated according to severity, contract and applicable law, including nature, affected data, measures and recommendations where appropriate.',
          'es-ES':
            'Los eventos de seguridad se investigan, mitigan y comunican según severidad, contrato y ley aplicable, incluyendo naturaleza, datos afectados, medidas y recomendaciones cuando proceda.',
          'de-DE':
            'Sicherheitsvorfälle werden untersucht, gemildert und gemäß Schweregrad, Vertrag und anwendbarem Recht kommuniziert, einschließlich Art, betroffener Daten, Maßnahmen und Empfehlungen soweit angemessen.',
        },
      },
      {
        title: { 'en-US': '6. Backups and continuity', 'es-ES': '6. Copias y continuidad', 'de-DE': '6. Backups und Kontinuität' },
        body: {
          'en-US':
            'Backups and recovery plans are maintained according to architecture and criticality; recovery objectives may vary by environment, plan and incident cause.',
          'es-ES':
            'Las copias y planes de recuperación se mantienen según arquitectura y criticidad; los objetivos de recuperación pueden variar por entorno, plan y causa del incidente.',
          'de-DE':
            'Backups und Wiederherstellungspläne werden gemäß Architektur und Kritikalität geführt; Recovery-Ziele können je nach Umgebung, Plan und Ursache variieren.',
        },
      },
      {
        title: { 'en-US': '7. Vulnerabilities', 'es-ES': '7. Vulnerabilidades', 'de-DE': '7. Schwachstellen' },
        body: {
          'en-US':
            'Researchers and customers should report vulnerabilities responsibly, without abusive exploitation, accessing third-party data or causing outages.',
          'es-ES':
            'Investigadores y clientes deben reportar vulnerabilidades de forma responsable, sin explotación abusiva, acceso a datos de terceros ni indisponibilización del servicio.',
          'de-DE':
            'Forscher und Kunden sollen Schwachstellen verantwortungsvoll melden, ohne missbräuchliche Ausnutzung, Zugriff auf Daten Dritter oder Ausfälle zu verursachen.',
        },
      },
      {
        title: { 'en-US': '8. Internal access', 'es-ES': '8. Acceso interno', 'de-DE': '8. Interner Zugriff' },
        body: {
          'en-US':
            'Aria personnel and contractors may access customer data only as needed for support, security, operations or legal duties, subject to confidentiality.',
          'es-ES':
            'El personal y contratistas de Aria solo pueden acceder a datos del cliente según necesidad de soporte, seguridad, operación u obligación legal, con confidencialidad.',
          'de-DE':
            'Aria-Mitarbeiter und -Auftragnehmer dürfen nur bei Bedarf für Support, Sicherheit, Betrieb oder gesetzliche Pflichten auf Kundendaten zugreifen, unter Wahrung der Vertraulichkeit.',
        },
      },
      {
        title: { 'en-US': '9. Limits', 'es-ES': '9. Límites', 'de-DE': '9. Grenzen' },
        body: {
          'en-US':
            'No policy eliminates all risk; security depends on cooperation among Aria, Customers, users, cloud providers and connected third parties.',
          'es-ES':
            'Ninguna política elimina todo riesgo; la seguridad depende de la cooperación entre Aria, Clientes, usuarios, proveedores de nube y terceros conectados.',
          'de-DE':
            'Keine Richtlinie beseitigt alle Risiken; Sicherheit hängt von der Zusammenarbeit zwischen Aria, Kunden, Nutzern, Cloud-Anbietern und verbundenen Dritten ab.',
        },
      },
    ],
  },
];

function buildDocsForLocale(locale) {
  if (I18N_SPECS.length !== legalDocsPtBr.length) {
    throw new Error(
      `[compliance i18n] I18N_SPECS length ${I18N_SPECS.length} !== legalDocsPtBr length ${legalDocsPtBr.length}`,
    );
  }
  return legalDocsPtBr.map((pt, idx) => {
    const spec = I18N_SPECS[idx];
    if (pt.type !== spec.type) {
      throw new Error(`[compliance i18n] type mismatch at ${idx}: pt=${pt.type} spec=${spec.type}`);
    }
    const prefix = locale === 'en-US' ? 'enus' : locale === 'es-ES' ? 'eses' : 'dede';
    const newId = pt.id.replace('legal-ptbr-', `legal-${prefix}-`);
    return {
      id: newId,
      type: pt.type,
      title: spec.titles[locale],
      audience: pt.audience,
      platform: pt.platform,
      jurisdiction: pt.jurisdiction,
      legalBasis: pt.legalBasis,
      requiresAcceptance: pt.requiresAcceptance,
      blocking: pt.blocking,
      changeSummary: spec.summaries[locale],
      content: md(locale, spec.titles, spec.sections),
    };
  });
}

// Nota: buildDocsForLocale só funciona após I18N_SPECS completo (17 entradas).
const legalDocsEnUs = buildDocsForLocale('en-US');
const legalDocsEsEs = buildDocsForLocale('es-ES');
const legalDocsDeDe = buildDocsForLocale('de-DE');

module.exports = {
  legalDocsEnUs,
  legalDocsEsEs,
  legalDocsDeDe,
};
