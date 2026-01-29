import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ProductDemo } from './compositions/ProductDemo';
import { productDemoSchema } from './compositions/ProductDemo/schema';
import { Explainer } from './compositions/Explainer';
import { explainerSchema } from './compositions/Explainer/schema';
import { Tutorial } from './compositions/Tutorial';
import { tutorialSchema } from './compositions/Tutorial/schema';
import { presets } from './config/presets';

const defaultProductDemoProps = {
  title: 'PubKeyMail',
  subtitle: 'Decentralized Email for Web3',
  showWalletConnect: true,
  showInbox: true,
};

const defaultExplainerProps = {
  headline: 'Email, Reimagined',
  points: [
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
  ],
};

const defaultTutorialProps = {
  steps: [
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
  ],
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
    </>
  );
};

registerRoot(RemotionRoot);
