import React from 'react';
import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';

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
    subject: 'Welcome to PubKeyMail! 🎉',
    preview: 'Your decentralized inbox is ready to go...',
    time: '2m',
    unread: true,
  },
  {
    id: '2',
    from: 'bob.sol',
    subject: 'Transaction confirmed ✅',
    preview: 'Your payment of 5 SOL has been processed...',
    time: '1h',
    unread: true,
  },
  {
    id: '3',
    from: 'dao.sol',
    subject: 'New proposal #42 🗳️',
    preview: 'Vote on the latest governance proposal...',
    time: '3h',
  },
];

export const EmailListAdapter: React.FC<EmailListAdapterProps> = ({
  delay = 0,
  emails = defaultEmails,
  staggerDelay = 8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        width: 520,
      }}
    >
      {emails.map((email, i) => {
        const itemDelay = delay + i * staggerDelay;
        const progress = spring({
          frame: frame - itemDelay,
          fps,
          config: { damping: 12, stiffness: 120, mass: 0.5 },
        });

        const hoverPulse = Math.sin((frame - itemDelay) * 0.1) * 2;

        return (
          <div
            key={email.id}
            style={{
              opacity: progress,
              transform: `translateX(${(1 - progress) * 80}px) translateY(${hoverPulse}px)`,
              background: email.unread
                ? 'linear-gradient(135deg, rgba(30, 30, 63, 0.95) 0%, rgba(20, 20, 45, 0.95) 100%)'
                : 'rgba(22, 22, 42, 0.9)',
              borderRadius: 16,
              padding: 22,
              borderLeft: email.unread ? '5px solid #14F195' : '5px solid transparent',
              boxShadow: email.unread
                ? '0 0 30px rgba(20, 241, 149, 0.2)'
                : '0 4px 20px rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 10,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: '#14F195',
                  fontWeight: 700,
                  fontSize: 18,
                  fontFamily: 'monospace',
                  textShadow: '0 0 20px rgba(20, 241, 149, 0.5)',
                }}
              >
                {email.from}
              </span>
              <span
                style={{
                  color: '#666',
                  fontSize: 14,
                  background: 'rgba(255,255,255,0.1)',
                  padding: '4px 10px',
                  borderRadius: 8,
                }}
              >
                {email.time}
              </span>
            </div>
            <div
              style={{
                color: 'white',
                fontWeight: email.unread ? 700 : 500,
                fontSize: 19,
                marginBottom: 8,
              }}
            >
              {email.subject}
            </div>
            <div
              style={{
                color: '#999',
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              {email.preview}
            </div>
          </div>
        );
      })}
    </div>
  );
};
