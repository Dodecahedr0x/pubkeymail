import { z } from 'zod';

export const integratorPitchSchema = z.object({
  companyName: z.string().default('Your App'),
});

export type IntegratorPitchProps = z.infer<typeof integratorPitchSchema>;
