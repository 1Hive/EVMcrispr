import type { Address, PublicClient } from "viem";
import { keccak256, parseAbi, toHex, trim } from "viem";

/**
 * Standarized storage slot determined by bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
 * and defined on EIP-1967 (https://eips.ethereum.org/EIPS/eip-1967#logic-contract-address)
 */
const EIP1967_STORAGE_SLOT = toHex(
  BigInt(keccak256(toHex("eip1967.proxy.implementation"))) - 1n,
);

const EIP1967_BEACON_STORAGE_SLOT = toHex(
  BigInt(keccak256(toHex("eip1967.proxy.beacon"))) - 1n,
);

const EIP1822_PROXIABLE = keccak256(toHex("PROXIABLE"));

const getAddressFromStorageSlot = async (
  contractAddress: Address,
  storageSlot: `0x${string}`,
  client: PublicClient,
): Promise<Address | undefined> => {
  const rawImplementationAddress: `0x${string}` | undefined =
    await client.getStorageAt({
      address: contractAddress,
      slot: storageSlot,
    });
  return rawImplementationAddress ? trim(rawImplementationAddress) : undefined;
};

export async function fetchImplementationAddress(
  address: Address,
  client: PublicClient,
): Promise<Address | undefined> {
  let implementationAddress: Address | undefined;
  implementationAddress = await getAddressFromStorageSlot(
    address,
    EIP1967_STORAGE_SLOT,
    client,
  );
  if (implementationAddress && implementationAddress !== "0x00") {
    return (
      (await fetchImplementationAddress(implementationAddress, client)) ||
      implementationAddress
    );
  }

  // TODO: Check if this works with UUPS
  implementationAddress = await getAddressFromStorageSlot(
    address,
    EIP1822_PROXIABLE,
    client,
  );
  if (implementationAddress && implementationAddress !== "0x00") {
    return (
      (await fetchImplementationAddress(implementationAddress, client)) ||
      implementationAddress
    );
  }

  const abi = parseAbi([
    "function implementation() public view returns (address)",
    "function childImplementation() external view returns (address)",
  ]);

  try {
    implementationAddress = await client.readContract({
      address,
      abi,
      functionName: "implementation",
    });
  } catch (_e) {
    implementationAddress = undefined;
    const beaconAddress = await getAddressFromStorageSlot(
      address,
      EIP1967_BEACON_STORAGE_SLOT,
      client,
    );
    if (beaconAddress && beaconAddress !== "0x00") {
      try {
        implementationAddress = await client.readContract({
          address: beaconAddress,
          abi,
          functionName: "implementation",
        });
      } catch (_err) {
        implementationAddress = await client.readContract({
          address: beaconAddress,
          abi,
          functionName: "childImplementation",
        });
      }
      implementationAddress =
        (await fetchImplementationAddress(implementationAddress, client)) ||
        implementationAddress;
      // TODO: Missing Special cases:
      // if (
      //   beaconAddress.toLowerCase() ===
      //   "0xbe86f647b167567525ccaafcd6f881f1ee558216"
      // ) {
      //   return [
      //     implementationAddress,
      //     "0x2c556ffbdcbd5abae92fed0231e2d1752a29d493",
      //   ];
      // }
    }
  }

  return implementationAddress;
}
