import { type EvmErc4337WalletConfig } from '@tetherto/wdk-wallet-evm-erc-4337'
import { type BtcWalletConfig } from '@tetherto/wdk-wallet-btc'
import { type SparkWalletConfig } from '@tetherto/wdk-wallet-spark'
import { type TronGasfreeWalletConfig } from '@tetherto/wdk-wallet-tron-gasfree'
import type { WdkConfigs } from '@tetherto/wdk-react-native-core'

export enum NETWORK_NAME {
  BITCOIN = 'bitcoin',
  ETHEREUM = 'ethereum',
  TRON = 'tron',
  SPARK = 'spark'
}

export const wdkConfigs: WdkConfigs<
  EvmErc4337WalletConfig | BtcWalletConfig | SparkWalletConfig | TronGasfreeWalletConfig
> = {
  networks: {
    [NETWORK_NAME.BITCOIN]: {
      blockchain: NETWORK_NAME.BITCOIN,
      config: {
        network: 'bitcoin',
        client: {
          type: 'blockbook-http',
          clientConfig: {
            url: process.env.EXPO_PUBLIC_BTC_PROVIDER as string
          }
        }
      }
    },
    [NETWORK_NAME.ETHEREUM]: {
      blockchain: NETWORK_NAME.ETHEREUM,
      config: {
        chainId: 1,
        provider: process.env.EXPO_PUBLIC_EVM_PROVIDER as string,
        bundlerUrl: process.env.EXPO_PUBLIC_EVM_BUNDLER_URL as string,
        paymasterUrl: process.env.EXPO_PUBLIC_EVM_PAYMASTER_URL as string,
        paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
        safeModulesVersion: '0.3.0',
        paymasterToken: {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
        },
        transferMaxFee: 10000000
      }
    },
    [NETWORK_NAME.SPARK]: {
      blockchain: NETWORK_NAME.SPARK,
      config: {
        network: 'MAINNET'
      }
    },
    [NETWORK_NAME.TRON]: {
      blockchain: NETWORK_NAME.TRON,
      config: {
        chainId: 3448148188, // Nile testnet
        provider: process.env.EXPO_PUBLIC_TRON_PROVIDER as string,
        gasFreeProvider: process.env.EXPO_PUBLIC_TRON_GASFREE_PROVIDER as string,
        gasFreeApiKey: process.env.EXPO_PUBLIC_TRON_GASFREE_API_KEY as string,
        gasFreeApiSecret: process.env.EXPO_PUBLIC_TRON_GASFREE_API_SECRET as string,
        serviceProvider: 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E',
        verifyingContract: 'THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc',
        transferMaxFee: 100000000000000
      }
    }
  }
}

export default wdkConfigs
