import { Config } from '@remotion/cli/config';
import path from 'path';

Config.setEntryPoint('./src/index.tsx');
Config.setPublicDir('./public');

Config.overrideWebpackConfig((config) => {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@web': path.resolve(process.cwd(), '../web'),
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        {
          test: /\.module\.css$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: {
                  localIdentName: '[name]__[local]___[hash:base64:5]',
                },
              },
            },
          ],
        },
      ],
    },
  };
});
