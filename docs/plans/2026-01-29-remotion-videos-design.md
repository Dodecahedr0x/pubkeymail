# Remotion Videos Package Design

## Overview

Create a `videos/` subpackage for generating video presentations of PubKeyMail using Remotion. The package adapts existing `web/components/` for video rendering and supports multiple video types and output formats.

## Video Types

- **Product demos** - Showing the email interface, wallet connection flow
- **Explainer/marketing** - Animated text, graphics explaining the concept
- **Tutorial walkthroughs** - Step-by-step guides with annotations

## Output Formats

Flexible per-video configuration with presets:
- YouTube: 1920x1080 (16:9)
- TikTok/Reels: 1080x1920 (9:16)
- Instagram: 1080x1080 (1:1)

## Project Structure

```
videos/
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── src/
│   ├── index.ts              # Registers all compositions
│   ├── config/
│   │   └── presets.ts        # Video dimension presets
│   ├── components/
│   │   ├── adapters/         # Adapts web components for video
│   │   └── primitives/       # Text reveals, transitions, backgrounds
│   ├── compositions/
│   │   ├── ProductDemo/
│   │   ├── Explainer/
│   │   └── Tutorial/
│   └── hooks/                 # Animation timing, sequences
└── public/                    # Assets (logos, sounds)
```

## Component Adaptation Strategy

Adapters wrap `web/components/` to add Remotion-compatible animations:

```tsx
import { WalletButton } from '../../../web/components/WalletButton';
import { useCurrentFrame, interpolate } from 'remotion';

export const WalletButtonAdapter = ({ enterFrame = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [enterFrame, enterFrame + 15], [0, 1]);
  
  return (
    <div style={{ opacity }}>
      <WalletButton />
    </div>
  );
};
```

## Scripts

- `npm run preview` - Open Remotion Studio for development
- `npm run render ProductDemo` - Render specific video
- `npm run render:all` - Render all videos
- `npm run build` - Bundle for production

## Integration with Root

Root `package.json` additions:
- `dev:videos` - Run Remotion preview
- `render:video` - Render videos from root
