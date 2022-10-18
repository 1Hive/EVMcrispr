import type { Address } from '@1hive/evmcrispr';

export const shortenAddress = (address: Address): string =>
  `${address.slice(0, 6)}..${address.slice(-4)}`;
