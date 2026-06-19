'use client';

import type { EmailAttachmentMeta } from '@/lib/api/emails';
import styles from './AttachmentList.module.css';

interface Props {
  attachments: EmailAttachmentMeta[];
}

/** Pick a representative icon for an attachment's content type. */
function iconForType(contentType: string): string {
  if (contentType.startsWith('image/')) return '🖼️';
  if (contentType === 'application/pdf') return '📄';
  if (contentType.startsWith('text/')) return '📝';
  if (contentType.includes('zip') || contentType.includes('compressed')) return '🗜️';
  if (contentType.startsWith('audio/')) return '🎵';
  if (contentType.startsWith('video/')) return '🎬';
  return '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments }: Props) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <section className={styles.wrapper} aria-label="Attachments">
      <h2 className={styles.heading}>
        {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
      </h2>
      <ul className={styles.list} role="list">
        {attachments.map((att, index) => {
          const isImage = att.contentType.startsWith('image/') && !!att.url;
          return (
            <li key={`${att.filename}-${index}`} className={styles.item}>
              {isImage ? (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.preview}
                >
                  <img src={att.url} alt={att.filename} className={styles.thumb} />
                </a>
              ) : (
                <span className={styles.icon} aria-hidden="true">
                  {iconForType(att.contentType)}
                </span>
              )}
              <div className={styles.meta}>
                <span className={styles.filename} title={att.filename}>
                  {att.filename}
                </span>
                <span className={styles.size}>
                  {formatSize(att.size)} · {att.contentType}
                </span>
              </div>
              {att.url && (
                <a
                  href={att.url}
                  download={att.filename}
                  className={styles.download}
                  aria-label={`Download ${att.filename}`}
                >
                  Download
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
