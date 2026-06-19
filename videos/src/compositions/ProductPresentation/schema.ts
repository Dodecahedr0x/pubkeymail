import { z } from 'zod';

export const productPresentationSchema = z.object({
  pricing: z.object({
    free: z.object({
      name: z.string(),
      price: z.string(),
      features: z.array(z.string()),
    }),
    pro: z.object({
      name: z.string(),
      price: z.string(),
      features: z.array(z.string()),
    }),
  }).default({
    free: {
      name: 'Free',
      price: '$0',
      features: ['1 wallet address', '100 emails/month', 'Basic support'],
    },
    pro: {
      name: 'Pro',
      price: '$5/mo',
      features: ['Unlimited wallets', 'Unlimited emails', 'Email forwarding', 'Priority support'],
    },
  }),
});

export type ProductPresentationProps = z.infer<typeof productPresentationSchema>;
