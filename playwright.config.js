import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./test',testMatch:'*.spec.js',fullyParallel:false,workers:1,timeout:30000,use:{headless:true},reporter:'list'});
