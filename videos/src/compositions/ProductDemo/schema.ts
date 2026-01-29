import { z } from 'zod';

export const productDemoSchema = z.object({
  title: z.string().default('PubKeyMail'),
  subtitle: z.string().default('Decentralized Email for Web3'),
  showWalletConnect: z.boolean().default(true),
  showInbox: z.boolean().default(true),
});

export type ProductDemoProps = z.infer<typeof productDemoSchema>;
