const { build } = require('electron-builder');
const path = require('path');

const config = {
  appId: 'com.securewipe.app',
  productName: 'SecureWipe',
  directories: {
    output: 'dist-electron',
    buildResources: 'build-resources'
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'node_modules/**/*',
    '!node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!node_modules/*.d.ts',
    '!node_modules/.bin',
    '!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}',
    '!.editorconfig',
    '!**/._*',
    '!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}',
    '!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}',
    '!**/{appveyor.yml,.travis.yml,circle.yml}',
    '!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}'
  ],
  extraResources: [
    {
      from: 'resources/',
      to: 'resources/'
    }
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32']
      },
      {
        target: 'msi',
        arch: ['x64', 'ia32']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    icon: 'build-resources/icon.ico',
    requestedExecutionLevel: 'requireAdministrator',
    signDlls: true,
    certificateFile: process.env.CSC_LINK || undefined,
    certificatePassword: process.env.CSC_KEY_PASSWORD || undefined,
  },
  nsis: {
    oneClick: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'SecureWipe'
  },
  msi: {
    oneClick: false
  },
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'build-resources/icon.icns',
    category: 'public.app-category.utilities',
    hardenedRuntime: true,
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.plist'
  },
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ],
    icon: 'build-resources/icon.png',
    category: 'Utility'
  },
  publish: null // Prevent auto-publishing
};

async function buildApp() {
  try {
    console.log('Building Electron app...');
    await build({ config });
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  buildApp();
}

module.exports = { buildApp, config };