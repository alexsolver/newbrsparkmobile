/**
 * Anexos no checklist: limite de tamanho e bloqueio de extensões/MIME típicos de executáveis e vetores comuns.
 * Não substitui antivírus; alinha-se a listas usuais em anexos corporativos.
 */

export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Extensões (sem ponto) bloqueadas — executáveis, instaladores, atalhos, scripts frequentemente abusados. */
const BLOCKED_EXTENSIONS = new Set(
  [
    'exe',
    'bat',
    'cmd',
    'com',
    'scr',
    'pif',
    'msi',
    'msp',
    'mst',
    'dll',
    'sys',
    'drv',
    'cpl',
    'msc',
    'lnk',
    'url',
    'reg',
    'inf',
    'ins',
    'isp',
    'hta',
    'jse',
    'wsf',
    'vbs',
    'vbe',
    'vb',
    'js',
    'mjs',
    'cjs',
    'ps1',
    'psm1',
    'psd1',
    'psc1',
    'psc2',
    'sh',
    'bash',
    'zsh',
    'ksh',
    'csh',
    'jar',
    'app',
    'deb',
    'rpm',
    'dmg',
    'pkg',
    'iso',
    'img',
    'bin',
    'run',
    'elf',
    'so',
    'dylib',
    'ocx',
    'gadget',
    'scf',
    'sct',
    'shb',
    'shs',
    'ade',
    'adp',
    'application',
    'wasm',
  ].map((e) => e.toLowerCase())
);

/** MIME exatos ou prefixos perigosos (minúsculas). */
const BLOCKED_MIME_EXACT = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-msi',
  'application/x-ms-shortcut',
  'application/x-sh',
  'application/x-csh',
  'application/x-httpd-php',
  'application/x-php',
  'text/x-php',
  'application/javascript',
  'text/javascript',
  'application/java-archive',
  'application/vnd.microsoft.portable-executable',
  'model/vnd.microsoft.portable-executable',
]);

const BLOCKED_MIME_PREFIXES = [
  'application/x-apple-diskimage', // .dmg
  'application/x-debian-package',
  'application/x-rpm',
];

export function extensionFromFileName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const base = name.split(/[/\\]/).pop() || '';
  const noQuery = base.split('?')[0];
  const i = noQuery.lastIndexOf('.');
  if (i <= 0 || i === noQuery.length - 1) return '';
  return noQuery.slice(i + 1).toLowerCase();
}

export function isBlockedAttachmentMime(mime: string | null | undefined): boolean {
  if (!mime || typeof mime !== 'string') return false;
  const m = mime.trim().toLowerCase();
  if (BLOCKED_MIME_EXACT.has(m)) return true;
  return BLOCKED_MIME_PREFIXES.some((p) => m.startsWith(p));
}

export function isBlockedAttachmentExtension(ext: string): boolean {
  if (!ext) return false;
  return BLOCKED_EXTENSIONS.has(ext.replace(/^\./, '').toLowerCase());
}

export type AttachmentGateResult =
  | { ok: true }
  | { ok: false; reason: 'size' | 'type'; message: string };

export function checkAttachmentMeta(options: {
  sizeBytes: number | null | undefined;
  fileName?: string | null;
  mimeType?: string | null;
}): AttachmentGateResult {
  const { sizeBytes, fileName, mimeType } = options;

  if (sizeBytes != null && Number.isFinite(sizeBytes) && sizeBytes > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: 'size',
      message: `O arquivo excede o limite de ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const ext = extensionFromFileName(fileName || '');
  if (ext && isBlockedAttachmentExtension(ext)) {
    return {
      ok: false,
      reason: 'type',
      message: `Este tipo de arquivo (.${ext}) não é permitido por motivos de segurança.`,
    };
  }

  if (mimeType && isBlockedAttachmentMime(mimeType)) {
    return {
      ok: false,
      reason: 'type',
      message: 'Este tipo de arquivo não é permitido por motivos de segurança.',
    };
  }

  return { ok: true };
}
