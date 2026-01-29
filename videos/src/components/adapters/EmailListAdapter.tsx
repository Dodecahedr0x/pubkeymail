import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface Email {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  unread?: boolean;
}

interface EmailListAdapterProps {
  delay?: number;
  emails?: Email[];
  staggerDelay?: number;
}

const defaultEmails: Email[] = [
  {
    id: '1',
    from: 'alice.sol',
    subject: 'Welcome to PubKeyMail!',
    preview: 'Your decentralized inbox is ready...',
    time: '2m ago',
    unread: true,
  },
  {
    id: '2',
    from: 'bob.sol',
    subject: 'Transaction confirmed',
    preview: 'Your payment has been processed...',
    time: '1h ago',
    unread: true,
  },
  {
    id: '3',
    from: 'dao.sol',
    subject: 'New proposal #42',
    preview: 'A new governance proposal has been submitted...',
    time: '3h ago',
  },
];

export const EmailListAdapter: React.FC<EmailListAdapterProps> = ({
  delay = 0,
  emails = defaultEmails,
  staggerDelay = 8,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 500,
      }}
    >
      {emails.map((email, i) => {
        const itemDelay = delay + i * staggerDelay;
        const opacity = interpolate(frame, [itemDelay, itemDelay + 15], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const y = interpolate(frame, [itemDelay, itemDelay + 15], [20, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div
            key={email.id}
            style={{
              opacity,
              transform: `translateY(${y}px)`,
              background: email.unread ? '#1e1e3f' : '#16162a',
              borderRadius: 8,
              padding: 16,
              borderLeft: email.unread ? '3px solid #14F195' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ color: '#14F195', fontWeight: 600, fontSize: 14 }}>
                {email.from}
              </span>
              <span style={{ color: '#888', fontSize: 12 }}>{email.time}</span>
            </div>
            <div
              style={{
                color: 'white',
                fontWeight: email.unread ? 600 : 400,
                fontSize: 15,
                marginBottom: 4,
              }}
            >
              {email.subject}
            </div>
            <div style={{ color: '#aaa', fontSize: 13 }}>{email.preview}</div>
          </div>
        );
      })}
    </div>
  );
};
