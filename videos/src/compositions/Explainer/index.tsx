import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { GradientBackground, SlideIn, FadeIn } from '@/components/primitives';
import { ExplainerProps } from './schema';

export const Explainer: React.FC<ExplainerProps> = ({
  headline = 'Email, Reimagined',
  points = [],
}) => {
  const pointDuration = 90;

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <GradientBackground from="#0f0f1a" to="#1a0a2e">
        {/* Headline */}
        <Sequence from={0} durationInFrames={60}>
          <AbsoluteFill
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlideIn direction="up" delay={10}>
              <h1
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  color: 'white',
                  textAlign: 'center',
                }}
              >
                {headline}
              </h1>
            </SlideIn>
          </AbsoluteFill>
        </Sequence>

        {/* Feature points */}
        {points.map((point, i) => (
          <Sequence
            key={i}
            from={60 + i * pointDuration}
            durationInFrames={pointDuration}
          >
            <AbsoluteFill
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 24,
              }}
            >
              <FadeIn delay={0}>
                <span style={{ fontSize: 80 }}>{point.icon}</span>
              </FadeIn>
              <SlideIn direction="up" delay={10}>
                <h2
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: 'white',
                    margin: 0,
                  }}
                >
                  {point.title}
                </h2>
              </SlideIn>
              <SlideIn direction="up" delay={20}>
                <p
                  style={{
                    fontSize: 28,
                    color: '#aaa',
                    margin: 0,
                    maxWidth: 600,
                    textAlign: 'center',
                  }}
                >
                  {point.description}
                </p>
              </SlideIn>
            </AbsoluteFill>
          </Sequence>
        ))}
      </GradientBackground>
    </AbsoluteFill>
  );
};
