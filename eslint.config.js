'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    // Main process, preload, tests and tool configs: Node, CommonJS.
    files: ['main.js', 'preload.js', 'lib/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    // End-to-end tests also pass functions to page.evaluate, which run in the page.
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    // The page: plain scripts that share window.MW. The lib/ files also load in Node for the tests (module, require).
    files: ['renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, MW: 'readonly', module: 'readonly', require: 'readonly' } }
  }
];
