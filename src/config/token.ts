import { AppAsset } from '@/entities/AppAsset';
import type { AppAssetConfig } from '@/entities/AppAsset';
/**
 * Main Application Asset Configurations
 * This list is used to instantiate AppAsset objects that are used throughout the app.
 */
export const tokenAssetConfigs: AppAssetConfig[] = [
  {
    id: 'ethereum-native',
    network: 'ethereum',
    isNative: true,
    address: null,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logo: require('../../assets/images/chains/ethereum-eth-logo.png')
  },
  {
    id: 'ethereum-usdt',
    network: 'ethereum',
    isNative: false,
    // Sepolia test USDT — same contract already used as paymasterToken in
    // doctor.runtime.example.json. The original mainnet address
    // (0xdAC17F958D2ee523a2206206994597C13D831ec7) does not exist on Sepolia.
    address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logo: require('../../assets/images/tokens/tether-usdt-logo.png')
  },
  {
    id: 'ethereum-xaut',
    network: 'ethereum',
    isNative: false,
    // UNVERIFIED for Sepolia — this is still the mainnet address. No Sepolia
    // equivalent has been confirmed. Don't rely on this entry for testing
    // until a real Sepolia address is found, or remove it for now.
    address: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    symbol: 'XAUT',
    name: 'Tether Gold',
    decimals: 6,
    logo: require('../../assets/images/tokens/tether-xaut-logo.png')
  },
  {
    id: 'ethereum-usat',
    network: 'ethereum',
    isNative: false,
    // UNVERIFIED for Sepolia — same caveat as XAUT above.
    address: '0x07041776f5007aca2a54844f50503a18a72a8b68',
    symbol: 'USAT',
    name: 'Tether USAT',
    decimals: 6
  },
  {
    id: 'bitcoin-native',
    network: 'bitcoin',
    isNative: true,
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8
  },
  {
    id: 'bitcoin-spark',
    network: 'spark',
    isNative: true,
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8
  },
  {
    id: 'tron-usdt',
    network: 'tron',
    isNative: false,
    // UNVERIFIED for Nile testnet — hasn't been independently confirmed here.
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
