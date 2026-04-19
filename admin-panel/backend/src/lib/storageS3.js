'use strict';

const fsp = require('fs/promises');
const path = require('path');

let _s3Client;
function s3() {
  if (_s3Client) return _s3Client;
  if (!String(process.env.AWS_S3_BUCKET || '').trim() || !String(process.env.AWS_REGION || '').trim()) {
    return null;
  }
  // eslint-disable-next-line global-require
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  _s3Client = { S3Client, PutObjectCommand, client: new S3Client({ region: process.env.AWS_REGION }) };
  return _s3Client;
}

/**
 * Faz upload para S3 se configurado; senão grava em `public/uploads/…` (mesmo padrão que tech registration).
 * @param {object} p
 * @param {string} p.prefix — ex. platform-contracts/
 * @param {Buffer} p.body
 * @param {string} p.filename
 * @param {string} p.contentType
 * @returns {Promise<{ publicUrl: string, storage: 's3'|'local' }>}
 */
async function putPublicObject(p) {
  const bucket = String(process.env.AWS_S3_BUCKET || '').trim();
  const s = s3();
  if (bucket && s) {
    const key = `${String(p.prefix || 'uploads').replace(/\/$/, '')}/${p.filename}`.replace(/^\/+/, '');
    await s.client.send(
      new s.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: p.body,
        ContentType: p.contentType || 'application/octet-stream',
        ACL: process.env.AWS_S3_ACL || undefined,
      })
    );
    const base = String(process.env.AWS_S3_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    if (!base) {
      return { publicUrl: `s3://${bucket}/${key}`, storage: 's3' };
    }
    return { publicUrl: `${base}/${key}`, storage: 's3' };
  }
  const dir = path.join(__dirname, '../../public/uploads', p.prefix || 'platform');
  await fsp.mkdir(dir, { recursive: true });
  const name = p.filename;
  const abs = path.join(dir, name);
  await fsp.writeFile(abs, p.body);
  return { publicUrl: `/uploads/${(p.prefix || 'platform').replace(/\/$/, '')}/${name}`, storage: 'local' };
}

module.exports = { putPublicObject, s3 };
