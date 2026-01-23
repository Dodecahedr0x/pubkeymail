/**
 * Database Seed Script
 * Populates database with test data
 *
 * Only use in development/test environments
 */

import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function seedDatabase(): Promise<void> {
  // Safety check: prevent running in production
  if (process.env['NODE_ENV'] === 'production') {
    console.error('Cannot seed database in production environment');
    process.exit(1);
  }

  console.log('Seeding database with test data...');

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Insert test blockchain addresses
    const testAddresses = [
      { address: '11111111111111111111111111111111', blockchain: 'solana' },
      { address: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A', blockchain: 'solana' },
      { address: 'DemoAddressForTesting123456789012345', blockchain: 'solana' },
    ];

    console.log('Inserting test blockchain addresses...');
    for (const addr of testAddresses) {
      await pool.query(
        `INSERT INTO blockchain_addresses (address, blockchain)
         VALUES ($1, $2)
         ON CONFLICT (address) DO NOTHING`,
        [addr.address, addr.blockchain]
      );
    }

    // Get address IDs
    const addressResult = await pool.query<{ id: number; address: string }>(
      'SELECT id, address FROM blockchain_addresses WHERE address = ANY($1)',
      [testAddresses.map(a => a.address)]
    );

    if (addressResult.rows.length > 0) {
      const primaryAddress = addressResult.rows[0];

      // Insert test user
      console.log('Inserting test user...');
      await pool.query(
        `INSERT INTO users (primary_address_id, subscription_status, subscription_tier)
         VALUES ($1, 'active', 'paid')
         ON CONFLICT (primary_address_id) DO NOTHING`,
        [primaryAddress?.id]
      );

      // Insert test emails
      console.log('Inserting test emails...');
      const testEmails = [
        {
          recipient_email: `${primaryAddress?.address}@pubkeymail.com`,
          sender_address: 'sender@example.com',
          subject: 'Welcome to PubKeyMail',
          body_text: 'Welcome to your blockchain-powered email!',
        },
        {
          recipient_email: `${primaryAddress?.address}@pubkeymail.com`,
          sender_address: 'notification@service.com',
          subject: 'Test Notification',
          body_text: 'This is a test notification email.',
        },
      ];

      for (const email of testEmails) {
        await pool.query(
          `INSERT INTO emails (recipient_address_id, recipient_email, sender_address, subject, body_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            primaryAddress?.id,
            email.recipient_email,
            email.sender_address,
            email.subject,
            email.body_text,
          ]
        );
      }
    }

    console.log('✅ Database seeded successfully');
    await pool.end();
  } catch (error) {
    console.error('Database seeding failed:', error);
    await pool.end();
    process.exit(1);
  }
}

seedDatabase();
