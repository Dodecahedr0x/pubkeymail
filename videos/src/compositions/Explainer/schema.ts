import { z } from 'zod';

export const explainerSchema = z.object({
  headline: z.string().default('Email, Reimagined'),
  points: z
    .array(
      z.object({
        icon: z.string(),
        title: z.string(),
        description: z.string(),
      })
    )
    .default([
      {
        icon: '🔐',
        title: 'Wallet-Based Identity',
        description: 'Your Solana wallet is your email address',
      },
      {
        icon: '📧',
        title: 'True Ownership',
        description: 'Your messages belong to you, not a corporation',
      },
      {
        icon: '⚡',
        title: 'Instant & Free',
        description: 'No gas fees for sending or receiving',
      },
    ]),
});

export type ExplainerProps = z.infer<typeof explainerSchema>;
