import { config as sharedConfig, type Config as SharedConfigType } from '@uaip/config';

export interface CapabilityRegistryConfig extends SharedConfigType {
  service: {
    name: string;
    port: number;
    env: string;
  };
}

export const config: CapabilityRegistryConfig = {
  ...sharedConfig,
  service: {
    name: 'capability-registry',
    port: parseInt(process.env.PORT || '3002', 10),
    env: process.env.NODE_ENV || 'development',
  },
};

export type Config = typeof config;
