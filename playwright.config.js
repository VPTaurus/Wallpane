'use strict';
const { defineConfig } = require('@playwright/test');

// End-to-end tests start the real Electron app (see test/e2e). One app at a time.
module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 60000,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list'
});
