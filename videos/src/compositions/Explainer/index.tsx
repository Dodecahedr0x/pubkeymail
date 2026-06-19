import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import {
  AnimatedGradient,
  FloatingIcons,
  ElasticPop,
  SlideBlast,
  ZoomBlur,
  FlipIn,
  ScreenFlash,
  PulsingGlow,
} from '@/components/primitives';
import { ExplainerProps } from './schema';

export const Explainer: React.FC<ExplainerProps> = ({
  headline = 'Email, Reimagined',
  points = [],
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pointDuration = 90;

  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <AnimatedGradient
        colors={['#0f0f1a', '#2a0a4e', '#0a2a3e', '#1a0a3e']}
        speed={0.4}
      >
        <FloatingIcons
          icons={['📧', '🔐', '⚡', '💎', '🌐', '🔗', '✨', '🚀']}
          seed="explainer"
        />

        {/* HEADLINE - Maximum impact */}
        <Sequence from={0} durationInFrames={60}>
          <AbsoluteFill
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScreenFlash delay={3} color="#9945FF" />

            <PulsingGlow color="#14F195" size={Math.min(width, height) * 0.9}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 20,
                }}
              >
                {headline.split(' ').map((word, i) => (
                  <SlideBlast
                    key={i}
                    delay={8 + i * 10}
                    direction={i % 2 === 0 ? 'left' : 'right'}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: Math.min(width * 0.12, 140),
                        fontWeight: 900,
                        color: i === 1 ? '#14F195' : 'white',
                        textTransform: 'uppercase',
                        letterSpacing: '-2px',
                        textShadow: i === 1
                          ? '0 0 60px rgba(20, 241, 149, 0.8)'
                          : '0 0 40px rgba(255, 255, 255, 0.3)',
                      }}
                    >
                      {word}
                    </span>
                  </SlideBlast>
                ))}
              </div>
            </PulsingGlow>

            {/* Animated burst lines */}
            {[...Array(8)].map((_, i) => {
              const angle = (i / 8) * 360;
              const lineLength = interpolate(frame, [25, 50], [0, 200], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: lineLength,
                    height: 4,
                    background: `linear-gradient(90deg, transparent, ${i % 2 === 0 ? '#14F195' : '#9945FF'})`,
                    transform: `rotate(${angle}deg) translateX(${150 + lineLength / 2}px)`,
                    transformOrigin: 'left center',
                    opacity: 0.6,
                  }}
                />
              );
            })}
          </AbsoluteFill>
        </Sequence>

        {/* FEATURE POINTS - Big and bold */}
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
                gap: 40,
              }}
            >
              <ScreenFlash delay={0} color={i % 2 === 0 ? '#14F195' : '#9945FF'} />

              {/* Giant icon */}
              <ZoomBlur delay={5}>
                <PulsingGlow color="#9945FF" size={300}>
                  <div
                    style={{
                      fontSize: Math.min(width * 0.18, 180),
                      filter: 'drop-shadow(0 0 50px rgba(20, 241, 149, 0.7))',
                    }}
                  >
                    {point.icon}
                  </div>
                </PulsingGlow>
              </ZoomBlur>

              {/* Title with flip */}
              <FlipIn delay={18} axis="x">
                <h2
                  style={{
                    fontSize: Math.min(width * 0.07, 80),
                    fontWeight: 800,
                    color: 'white',
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '4px',
                    textShadow: '0 0 60px rgba(153, 69, 255, 0.6)',
                    textAlign: 'center',
                  }}
                >
                  {point.title}
                </h2>
              </FlipIn>

              {/* Description slides in */}
              <SlideBlast delay={30} direction="up">
                <p
                  style={{
                    fontSize: Math.min(width * 0.032, 36),
                    color: '#ddd',
                    margin: 0,
                    maxWidth: width * 0.7,
                    textAlign: 'center',
                    lineHeight: 1.6,
                    fontWeight: 500,
                  }}
                >
                  {point.description}
                </p>
              </SlideBlast>

              {/* Big progress dots */}
              <div
                style={{
                  position: 'absolute',
                  bottom: height * 0.08,
                  display: 'flex',
                  gap: 20,
                }}
              >
                {points.map((_, j) => (
                  <ElasticPop key={j} delay={j === i ? 40 : 0}>
                    <div
                      style={{
                        width: j === i ? 60 : 20,
                        height: 20,
                        borderRadius: 10,
                        background: j === i
                          ? 'linear-gradient(90deg, #14F195, #9945FF)'
                          : 'rgba(255,255,255,0.2)',
                        boxShadow: j === i ? '0 0 30px rgba(20, 241, 149, 0.6)' : 'none',
                      }}
                    />
                  </ElasticPop>
                ))}
              </div>
            </AbsoluteFill>
          </Sequence>
        ))}
      </AnimatedGradient>
    </AbsoluteFill>
  );
};
