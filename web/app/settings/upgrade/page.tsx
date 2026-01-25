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
  const [paymentRequest, setPaymentRequest] = useState<paymentsApi.SolanaPayRequest | null>(null);
  
  useEffect(() => {
    async function fetchPricing() {
      const result = await paymentsApi.getPricing();
      if (result.data) {
        setPricing(result.data);
      }
    }
    fetchPricing();
  }, []);
  
  const handleSolanaPayCheckout = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await paymentsApi.createSolanaPayRequest(user.id, selectedPlan);
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      setPaymentRequest(result.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payment request');
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
            {pricing?.monthly?.usdc?.formatted || '$2'}
            <span>/month</span>
          </div>
        </button>
        
        <button
          className={`${styles.plan} ${selectedPlan === 'yearly' ? styles.selected : ''}`}
          onClick={() => setSelectedPlan('yearly')}
        >
          <div className={styles.badge}>Save 37%</div>
          <h3>Yearly</h3>
          <div className={styles.price}>
            {pricing?.yearly?.usdc?.formatted || '$15'}
            <span>/year</span>
          </div>
          <p className={styles.savings}>Save over 4 months!</p>
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
        {paymentRequest ? (
          <div className={styles.paymentInfo}>
            <p>Send {selectedPlan === 'monthly' ? (pricing?.monthly?.usdc?.formatted || '$2') : (pricing?.yearly?.usdc?.formatted || '$15')} USDC to:</p>
            <code className={styles.address}>{paymentRequest.recipient}</code>
            <p className={styles.reference}>Reference: {paymentRequest.reference}</p>
            <button 
              className="btn btn-secondary"
              onClick={() => setPaymentRequest(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSolanaPayCheckout}
            disabled={loading}
          >
            {loading ? 'Processing...' : `Pay with USDC - ${selectedPlan === 'monthly' ? (pricing?.monthly?.usdc?.formatted || '$2') : (pricing?.yearly?.usdc?.formatted || '$15')}`}
          </button>
        )}
        
        <p className={styles.note}>
          Secure payment powered by Solana Pay
        </p>
      </div>
    </div>
  );
}
