import { z } from 'zod';

export const tutorialSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        highlight: z.string().optional(),
      })
    )
    .default([
      {
        title: 'Step 1: Connect Wallet',
        description: 'Click the Connect Wallet button and approve the connection',
        highlight: 'wallet',
      },
      {
        title: 'Step 2: View Inbox',
        description: 'Your inbox shows all messages sent to your wallet address',
        highlight: 'inbox',
      },
      {
        title: 'Step 3: Compose Message',
        description: 'Click Compose to send a message to any Solana address',
        highlight: 'compose',
      },
    ]),
});

export type TutorialProps = z.infer<typeof tutorialSchema>;
