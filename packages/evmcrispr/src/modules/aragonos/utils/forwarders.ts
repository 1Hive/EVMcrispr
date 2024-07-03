import type { PublicClient } from "viem";
import { parseAbi, toHex, zeroAddress } from "viem";

import { erc20ABI } from "../../../../abis";
import { ErrorInvalid } from "../../../errors";
import type { Action, TransactionAction } from "../../../types";
import { encodeCallScript } from "./evmscripts";
import type { Address, Module } from "../../..";
import { encodeAction } from "../../../utils";

export const FORWARDER_TYPES = {
  NOT_IMPLEMENTED: 0,
  NO_CONTEXT: 1,
  WITH_CONTEXT: 2,
};

export const isForwarder = async (
  address: Address,
  client: PublicClient,
): Promise<boolean> => {
  try {
    return await client.readContract({
      address,
      abi: parseAbi(forwarderABI),
      functionName: "isForwarder",
    });
  } catch (_err) {
    return false;
  }
};

export const getForwarderFee = async (
  address: Address,
  client: PublicClient,
): Promise<readonly [Address, bigint] | undefined> => {
  // If it fails we assume app is not a payable forwarder
  try {
    return await client.readContract({
      address,
      abi: parseAbi(forwarderABI),
      functionName: "forwardFee",
    });
  } catch (_err) {
    return;
  }
};

export const getForwarderType = async (
  address: Address,
  client: PublicClient,
): Promise<number> => {
  // If it fails then we assume app implements an aragonos older version forwarder
  try {
    return await client.readContract({
      address,
      abi: parseAbi(forwarderABI),
      functionName: "forwarderType",
    });
  } catch (_err) {
    return FORWARDER_TYPES.NO_CONTEXT;
  }
};

export const forwarderABI = [
  "function forward(bytes evmCallScript) public",
  "function isForwarder() external pure returns (bool)",
  "function canForward(address sender, bytes evmCallScript) public view returns (bool)",
  "function forwardFee() external view returns (address, uint256)",
  "function forwarderType() external pure returns (uint8)",
] as const;

export const batchForwarderActions = async (
  module: Module,
  forwarderActions: TransactionAction[],
  forwarders: Address[],
  context?: string,
  checkForwarder = true,
): Promise<Action[]> => {
  let script: string;
  let value: bigint = 0n;
  const actions: Action[] = [];

  const client = await module.getClient();

  for (const forwarderAddress of forwarders) {
    script = encodeCallScript(forwarderActions);

    if (checkForwarder && !(await isForwarder(forwarderAddress, client))) {
      throw new ErrorInvalid(`app ${forwarderAddress} is not a forwarder`);
    }

    const fee = await getForwarderFee(forwarderAddress, client);

    if (fee) {
      const [feeTokenAddress, feeAmount] = fee;

      // Check if fees are in ETH
      if (feeTokenAddress === zeroAddress) {
        value = feeAmount;
      } else {
        const allowance = await client.readContract({
          address: feeTokenAddress,
          abi: erc20ABI,
          functionName: "allowance",
          args: [await module.getConnectedAccount(), forwarderAddress],
        });

        if (allowance > 0n && allowance < feeAmount) {
          actions.push(
            encodeAction(feeTokenAddress, "approve(address,uint256)", [
              forwarderAddress,
              0,
            ]),
          );
        }
        if (allowance === 0n) {
          actions.push(
            encodeAction(feeTokenAddress, "approve(address,uint256)", [
              forwarderAddress,
              feeAmount,
            ]),
          );
        }
      }
    }

    if (
      (await getForwarderType(forwarderAddress, client)) ===
      FORWARDER_TYPES.WITH_CONTEXT
    ) {
      if (!context) {
        throw new ErrorInvalid(`context option missing`);
      }
      forwarderActions = [
        encodeAction(forwarderAddress, "forward(bytes,bytes)", [
          script,
          toHex(context),
        ]),
      ];
    } else {
      forwarderActions = [
        encodeAction(forwarderAddress, "forward(bytes)", [script]),
      ];
    }
  }
  if (value) {
    forwarderActions[forwarderActions.length - 1].value = value;
  }
  return [...actions, ...forwarderActions];
};
