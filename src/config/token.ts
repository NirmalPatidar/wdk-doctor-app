import { AppAsset } from '@/entities/AppAsset';
import type { AppAssetConfig } from '@/entities/AppAsset';
import { NETWORK_NAME } from './chain';

/**
 * Main Application Asset Configurations
 * This list is used to instantiate AppAsset objects that are used throughout the app.
 */
export const tokenAssetConfigs: AppAssetConfig[] = [
  {
    id: 'ethereum-native',
    network: NETWORK_NAME.ETHEREUM,
    isNative: true,
    address: null,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logo: require('../../assets/images/chains/ethereum-eth-logo.png')
  },
  {
    id: 'ethereum-usdt',
    network: NETWORK_NAME.ETHEREUM,
    isNative: false,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logo: require('../../assets/images/tokens/tether-usdt-logo.png')
  },
  {
    id: 'ethereum-xaut',
    network: NETWORK_NAME.ETHEREUM,
    isNative: false,
    address: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    symbol: 'XAUT',
    name: 'Tether Gold',
    decimals: 6,
    logo: require('../../assets/images/tokens/tether-xaut-logo.png')
  },
  {
    id: 'ethereum-usat',
    network: NETWORK_NAME.ETHEREUM,
    isNative: false,
    address: '0x07041776f5007aca2a54844f50503a18a72a8b68',
    symbol: 'USAT',
    name: 'Tether USAT',
    decimals: 6
  },
  {
    id: 'bitcoin-native',
    network: NETWORK_NAME.BITCOIN,
    isNative: true,
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8
  },
  {
    id: 'bitcoin-spark',
    network: NETWORK_NAME.SPARK,
    isNative: true,
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8
  },
  {
    id: 'tron-usdt',
    network: NETWORK_NAME.TRON,
    isNative: false,
    address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logo: require('../../assets/images/tokens/tether-usdt-logo.png')
  }
];

const TOKENS: AppAsset[] = AppAsset.fromConfigs(tokenAssetConfigs);

/**
 * Export a map for easy asset lookup by their unique ID.
 * e.g. tokenMap.get('ethereum-usdt')
 */
export const TOKEN_MAP: Map<string, AppAsset> = new Map(
  TOKENS.map(t => [t.getId(), t])
);
