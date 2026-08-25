import { BaseAsset, type AssetConfig } from '@tetherto/wdk-react-native-core';
import type { ImageSourcePropType } from 'react-native';

/**
 * Extended Asset Configuration for the App
 * Adds UI-specific properties like logos and colors.
 */
export type AppAssetConfig = AssetConfig & {
  logo?: ImageSourcePropType;
  color?: string;
};

/**
 * App Specific Asset Entity
 * Extends the core BaseAsset to include app-specific logic and data accessors.
 */
export class AppAsset extends BaseAsset {
  // Override config type to be our extended version
  protected readonly config: AppAssetConfig;

  constructor(config: AppAssetConfig) {
    super(config);
    this.config = config;
  }

  /**
   * Get the asset logo image source
   */
  getLogo(): ImageSourcePropType | undefined {
    return this.config.logo;
  }

  /**
   * Get the asset brand color
   */
  getColor(): string | undefined {
    return this.config.color;
  }

  /**
   * Factory: Create an AppAsset from a configuration object
   */
  static fromConfig(config: AppAssetConfig): AppAsset {
    return new AppAsset(config);
  }

  /**
   * Factory: Create a list of AppAssets from a list of configurations
   */
  static fromConfigs(configs: AppAssetConfig[]): AppAsset[] {
    return configs.map(c => new AppAsset(c));
  }
}
