import { config as sharedConfig } from '@uaip/config';

export const config = {
  ...sharedConfig,
  service: {
    name: 'capability-registry',
    port: parseInt(process.env.PORT || '3002', 10),
    env: process.env.NODE_ENV || 'development'
  }
};

export type Config = typeof config; 