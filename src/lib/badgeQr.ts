import type { Attendee, BadgeLevel } from '../types/index';
import { BADGE_COLORS, getBadgeLevel } from '../types/index';

/**
 * QR Code do crachá: aponta para /badge/<id> no endereço oficial do site.
 *
 * O endereço vem de VITE_PUBLIC_SITE_URL (definido no Vercel). Sem ele, usa o endereço
 * onde o site está aberto. QR gerado a partir de "localhost" não funciona no celular de
 * ninguém, por isso a tela avisa (isLocalAddress).
 */
export function publicSiteUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  return (configured || window.location.origin).replace(/\/+$/, '');
}

export const isLocalAddress = (url: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*\.local)(:|\/|$)/i.test(url);

export const badgeUrl = (attendeeId: string) => `${publicSiteUrl()}/badge/${encodeURIComponent(attendeeId)}`;

const BADGE_LABEL: Record<BadgeLevel, string> = { VIP: 'VIP', SILVER: 'SILVER', PATROCINADOR: 'PATROCINADOR' };

async function qrLib() {
  return (await import('qrcode')).default;
}

/** QR em SVG (para a tela e a folha de impressão). */
export async function qrSvg(attendeeId: string): Promise<string> {
  const QRCode = await qrLib();
  return QRCode.toString(badgeUrl(attendeeId), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

/**
 * PNG para impressão: QR (alta resolução) + nome e tipo de crachá embaixo,
 * para saber de quem é cada adesivo na hora de colar.
 */
export async function qrPngWithLabel(attendee: Attendee): Promise<Blob> {
  const QRCode = await qrLib();
  const size = 900;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, badgeUrl(attendee.id), { errorCorrectionLevel: 'M', margin: 2, width: size });

  const canvas = document.createElement('canvas');
  const labelHeight = 210;
  canvas.width = size;
  canvas.height = size + labelHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrCanvas, 0, 0);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 54px Arial, sans-serif';
  const lines = wrapText(ctx, attendee.name, size - 60, 2);
  lines.forEach((line, i) => ctx.fillText(line, size / 2, size + 50 + i * 62));

  const level = getBadgeLevel(attendee);
  ctx.fillStyle = BADGE_COLORS[level];
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText(BADGE_LABEL[level], size / 2, size + 50 + lines.length * 62 + 18);

  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))), 'image/png')
  );
}

export const safeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'participante';

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** ZIP com uma pasta por tipo de crachá: VIP/, SILVER/, PATROCINADOR/. */
export async function buildQrZip(attendees: Attendee[], onProgress: (done: number) => void): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();
  let done = 0;
  for (const a of attendees) {
    const level = getBadgeLevel(a);
    let file = `${BADGE_LABEL[level]}/${safeFileName(a.name)}.png`;
    // Homônimos: não deixa um arquivo sobrescrever o outro
    for (let n = 2; used.has(file); n++) file = `${BADGE_LABEL[level]}/${safeFileName(a.name)} (${n}).png`;
    used.add(file);
    zip.file(file, await qrPngWithLabel(a));
    onProgress(++done);
  }
  return zip.generateAsync({ type: 'blob' });
}
