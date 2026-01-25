'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers';
import * as paymentsApi from '@/lib/api/payments';
import styles from './page.module.css';

export default function UpgradePage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [pricing, setPricing] = useState<paymentsApi.Pricing | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchPricing() {
      const result = await paymentsApi.getPricing();
      if (result.data) {
        setPricing(result.data);
      }
    }
    fetchPricing();
  }, []);
  
  const handleStripeCheckout = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const successUrl = `${window.location.origin}/settings?success=true`;
      const cancelUrl = `${window.location.origin}/settings/upgrade`;
      
      const result = await paymentsApi.createStripeCheckout(
        user.id,
        selectedPlan,
        successUrl,
        cancelUrl
      );
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      window.location.href = result.data!.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };
  
  if (user?.subscriptionTier === 'paid') {
    return (
      <div className={styles.alreadyPro}>
        <span className={styles.icon}>⭐</span>
        <h2>You're already on Pro!</h2>
        <p>Thank you for your support.</p>
        <button className="btn btn-secondary" onClick={() => router.push('/settings')}>
          Back to Settings
        </button>
      </div>
    );
  }
  
  return (
    <div className={styles.upgrade}>
      <h1>Upgrade to Pro</h1>
      <p className={styles.subtitle}>Unlock the full power of PubKeyMail</p>
      
      {error && (
        <div className={styles.error}>{error}</div>
      )}
      
      <div className={styles.plans}>
        <button
          className={`${styles.plan} ${selectedPlan === 'monthly' ? styles.selected : ''}`}
          onClick={() => setSelectedPlan('monthly')}
        >
          <h3>Monthly</h3>
          <div className={styles.price}>
            {pricing?.monthly?.usd?.formatted || '$9.99'}
            <span>/month</span>
          </div>
        </button>
        
        <button
          className={`${styles.plan} ${selectedPlan === 'yearly' ? styles.selected : ''}`}
          onClick={() => setSelectedPlan('yearly')}
        >
          <div className={styles.badge}>Save 17%</div>
          <h3>Yearly</h3>
          <div className={styles.price}>
            {pricing?.yearly?.usd?.formatted || '$99.99'}
            <span>/year</span>
          </div>
          <p className={styles.savings}>2 months free!</p>
        </button>
      </div>
      
      <div className={styles.features}>
        <h3>What's included:</h3>
        <ul>
          <li>✅ Send emails from your wallet address</li>
          <li>✅ Extended email retention (1 year)</li>
          <li>✅ Email forwarding rules</li>
          <li>✅ Link up to 10 wallet addresses</li>
          <li>✅ Higher rate limits</li>
          <li>✅ Priority support</li>
        </ul>
      </div>
      
      <div className={styles.checkout}>
        <button
          className="btn btn-primary"
          onClick={handleStripeCheckout}
          disabled={loading}
        >
          {loading ? 'Processing...' : `Pay with Card - ${selectedPlan === 'monthly' ? (pricing?.monthly?.usd?.formatted || '$9.99') : (pricing?.yearly?.usd?.formatted || '$99.99')}`}
        </button>
        
        <p className={styles.note}>
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}
