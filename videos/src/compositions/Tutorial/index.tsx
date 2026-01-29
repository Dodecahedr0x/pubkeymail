import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { GradientBackground, SlideIn, FadeIn } from '@/components/primitives';
import {
  WalletButtonAdapter,
  SidebarAdapter,
  EmailListAdapter,
} from '@/components/adapters';
import { TutorialProps } from './schema';

export const Tutorial: React.FC<TutorialProps> = ({ steps = [] }) => {
  const stepDuration = 120;

  const renderHighlight = (highlight?: string) => {
    switch (highlight) {
      case 'wallet':
        return <WalletButtonAdapter delay={30} connected={false} />;
      case 'inbox':
        return (
          <div style={{ display: 'flex', gap: 24 }}>
            <SidebarAdapter delay={30} activeItem="inbox" />
            <EmailListAdapter delay={45} />
          </div>
        );
      case 'compose':
        return <SidebarAdapter delay={30} activeItem="compose" />;
      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <GradientBackground from="#0a1a0a" to="#1a2e1a">
        {steps.map((step, i) => (
          <Sequence
            key={i}
            from={i * stepDuration}
            durationInFrames={stepDuration}
          >
            <AbsoluteFill
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 40,
                padding: 60,
              }}
            >
              {/* Step indicator */}
              <FadeIn delay={0}>
                <div
                  style={{
                    background: '#14F195',
                    color: '#0a0a0a',
                    padding: '8px 20px',
                    borderRadius: 20,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  Step {i + 1} of {steps.length}
                </div>
              </FadeIn>

              {/* Title */}
              <SlideIn direction="up" delay={10}>
                <h2
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: 'white',
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  {step.title}
                </h2>
              </SlideIn>

              {/* Description */}
              <SlideIn direction="up" delay={20}>
                <p
                  style={{
                    fontSize: 24,
                    color: '#aaa',
                    margin: 0,
                    maxWidth: 700,
                    textAlign: 'center',
                  }}
                >
                  {step.description}
                </p>
              </SlideIn>

              {/* Visual highlight */}
              <FadeIn delay={30} style={{ marginTop: 20 }}>
                {renderHighlight(step.highlight)}
              </FadeIn>
            </AbsoluteFill>
          </Sequence>
        ))}
      </GradientBackground>
    </AbsoluteFill>
  );
};
