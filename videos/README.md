# PubKeyMail Videos

Video presentations generated with [Remotion](https://remotion.dev/).

## Quick Start

```bash
# Install dependencies
npm install

# Open Remotion Studio to preview videos
npm run preview

# Render a specific video
npm run render ProductDemo out/product-demo.mp4

# Render all videos
npm run render:all
```

## Available Compositions

| ID | Description | Format |
|----|-------------|--------|
| `ProductDemo` | Full product walkthrough | YouTube (1920x1080) |
| `ProductDemo-TikTok` | Product walkthrough | TikTok (1080x1920) |
| `Explainer` | Feature highlights | YouTube (1920x1080) |
| `Explainer-Instagram` | Feature highlights | Instagram (1080x1080) |
| `Tutorial` | Step-by-step guide | YouTube (1920x1080) |

## Project Structure

```
videos/
├── src/
│   ├── index.tsx              # Composition registry
│   ├── config/presets.ts      # Video dimension presets
│   ├── components/
│   │   ├── adapters/          # Wraps web/ components for video
│   │   └── primitives/        # Reusable animation components
│   ├── compositions/          # Individual videos
│   │   ├── ProductDemo/
│   │   ├── Explainer/
│   │   └── Tutorial/
│   └── hooks/                 # Animation utilities
└── public/                    # Static assets
```

## Creating New Videos

1. Create a new folder in `src/compositions/`
2. Add `schema.ts` for input props (using Zod)
3. Add `index.tsx` for the composition
4. Register in `src/index.tsx`

## Customizing Videos

Pass props when rendering:

```bash
npm run render ProductDemo out/custom.mp4 -- --props='{"title":"Custom Title"}'
```

## Adapting Web Components

Components from `../web/components/` can be wrapped in adapters:

```tsx
import { WalletButton } from '@web/components/WalletButton';
import { useFadeIn } from '@/hooks/useAnimatedValue';

export const WalletButtonAdapter = ({ delay = 0 }) => {
  const opacity = useFadeIn(delay);
  return (
    <div style={{ opacity }}>
      <WalletButton />
    </div>
  );
};
```
