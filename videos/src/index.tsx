import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ProductDemo } from './compositions/ProductDemo';
import { productDemoSchema } from './compositions/ProductDemo/schema';
import { Explainer } from './compositions/Explainer';
import { explainerSchema } from './compositions/Explainer/schema';
import { Tutorial } from './compositions/Tutorial';
import { tutorialSchema } from './compositions/Tutorial/schema';
import { ProductPresentation } from './compositions/ProductPresentation';
import { productPresentationSchema } from './compositions/ProductPresentation/schema';
import { IntegratorPitch } from './compositions/IntegratorPitch';
import { integratorPitchSchema } from './compositions/IntegratorPitch/schema';
import { presets } from './config/presets';

const defaultProductDemoProps = {
  title: 'PubKeyMail',
  subtitle: 'Your Wallet Is Your Email',
  showWalletConnect: true,
  showInbox: true,
};

const defaultExplainerProps = {
  headline: 'Your Wallet, Your Email',
  points: [
    {
      icon: '🔑',
      title: 'An Address From Your Wallet',
      description:
        'Your wallet gets a real inbox: yourname.sol@pubkeymail.com. On-chain identity, finally reachable.',
    },
    {
      icon: '📨',
      title: 'Anyone Can Reach You',
      description:
        'Receive mail from any wallet — or any inbox, even Gmail. Every wallet you own, one unified inbox.',
    },
    {
      icon: '⚡',
      title: 'No Password. No Signup.',
      description:
        'Connect your wallet, sign once, and you are in. That is the entire setup.',
    },
  ],
};

const defaultTutorialProps = {
  steps: [
    {
      title: 'Connect & Sign In',
      description: 'No password, no signup form. Connect your wallet and sign once — that is it.',
      highlight: 'wallet',
    },
    {
      title: 'Your Inbox Is Ready',
      description: 'Every wallet gets yourname.sol@pubkeymail.com. All your addresses, one inbox.',
      highlight: 'inbox',
    },
    {
      title: 'Send From Your Wallet',
      description: 'Reply and compose straight from your wallet address. Anyone can receive it.',
      highlight: 'compose',
    },
  ],
};

const defaultProductPresentationProps = {
  pricing: {
    free: {
      name: 'Free',
      price: '$0',
      features: ['1 wallet address', 'Receive unlimited email', 'yourname.sol@pubkeymail.com'],
    },
    pro: {
      name: 'Pro',
      price: '$5/mo',
      features: ['Link unlimited wallets', 'Send & reply', 'Forward to any inbox', 'End-to-end encryption'],
    },
  },
};

const defaultIntegratorPitchProps = {
  companyName: 'Your App',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Product Demo - YouTube format */}
      <Composition
        id="ProductDemo"
        component={ProductDemo}
        schema={productDemoSchema}
        defaultProps={defaultProductDemoProps}
        durationInFrames={300}
        fps={presets.youtube.fps}
        width={presets.youtube.width}
        height={presets.youtube.height}
      />

      {/* Product Demo - TikTok format */}
      <Composition
        id="ProductDemo-TikTok"
        component={ProductDemo}
        schema={productDemoSchema}
        defaultProps={defaultProductDemoProps}
        durationInFrames={300}
        fps={presets.tiktok.fps}
        width={presets.tiktok.width}
        height={presets.tiktok.height}
      />

      {/* Explainer - YouTube format */}
      <Composition
        id="Explainer"
        component={Explainer}
        schema={explainerSchema}
        defaultProps={defaultExplainerProps}
        durationInFrames={330}
        fps={presets.youtube.fps}
        width={presets.youtube.width}
        height={presets.youtube.height}
      />

      {/* Explainer - Instagram format */}
      <Composition
        id="Explainer-Instagram"
        component={Explainer}
        schema={explainerSchema}
        defaultProps={defaultExplainerProps}
        durationInFrames={330}
        fps={presets.instagram.fps}
        width={presets.instagram.width}
        height={presets.instagram.height}
      />

      {/* Tutorial - YouTube format */}
      <Composition
        id="Tutorial"
        component={Tutorial}
        schema={tutorialSchema}
        defaultProps={defaultTutorialProps}
        durationInFrames={360}
        fps={presets.youtube.fps}
        width={presets.youtube.width}
        height={presets.youtube.height}
      />

      {/* Product Presentation - Full feature showcase */}
      <Composition
        id="ProductPresentation"
        component={ProductPresentation}
        schema={productPresentationSchema}
        defaultProps={defaultProductPresentationProps}
        durationInFrames={900}
        fps={presets.youtube.fps}
        width={presets.youtube.width}
        height={presets.youtube.height}
      />

      {/* Product Presentation - TikTok format */}
      <Composition
        id="ProductPresentation-TikTok"
        component={ProductPresentation}
        schema={productPresentationSchema}
        defaultProps={defaultProductPresentationProps}
        durationInFrames={900}
        fps={presets.tiktok.fps}
        width={presets.tiktok.width}
        height={presets.tiktok.height}
      />

      {/* Integrator Pitch - B2B showcase */}
      <Composition
        id="IntegratorPitch"
        component={IntegratorPitch}
        schema={integratorPitchSchema}
        defaultProps={defaultIntegratorPitchProps}
        durationInFrames={740}
        fps={presets.youtube.fps}
        width={presets.youtube.width}
        height={presets.youtube.height}
      />

      {/* Integrator Pitch - TikTok format */}
      <Composition
        id="IntegratorPitch-TikTok"
        component={IntegratorPitch}
        schema={integratorPitchSchema}
        defaultProps={defaultIntegratorPitchProps}
        durationInFrames={740}
        fps={presets.tiktok.fps}
        width={presets.tiktok.width}
        height={presets.tiktok.height}
      />
    </>
  );
};

registerRoot(RemotionRoot);
