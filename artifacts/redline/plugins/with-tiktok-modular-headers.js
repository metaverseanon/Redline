const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# tiktok-modular-headers';

const withTikTokModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        return cfg;
      }
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes(MARKER)) {
        return cfg;
      }

      const inject = [
        '',
        `  ${MARKER}`,
        `  pod 'TikTokBusinessSDK', :modular_headers => true`,
        '',
      ].join('\n');

      // Insert right after the `target '<AppName>' do` line.
      const targetRe = /(target\s+['"][^'"]+['"]\s+do)/;
      if (targetRe.test(contents)) {
        contents = contents.replace(targetRe, `$1\n${inject}`);
      } else {
        // Fallback: append at end.
        contents += `\n${inject}\n`;
      }

      fs.writeFileSync(podfilePath, contents, 'utf8');
      return cfg;
    },
  ]);
};

module.exports = withTikTokModularHeaders;
