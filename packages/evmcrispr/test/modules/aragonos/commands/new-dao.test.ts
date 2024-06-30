import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient, WalletClient } from "viem";
import { decodeAbiParameters, parseAbiParameters } from "viem";

import { BindingsSpace } from "../../../../src/types";
import type { AragonOS } from "../../../../src/modules/aragonos/AragonOS";
import type { TransactionAction } from "../../../../src/types";
import { addressesEqual } from "../../../../src/utils";

import { createInterpreter } from "../../../test-helpers/cas11";

describe("AragonOS > commands > new-dao <daoName>", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  before(async () => {
    client = await viem.getPublicClient();
    [walletClient] = await viem.getWalletClients();
  });

  it("should create a new dao correctly", async () => {
    const daoName = "my-evmcrispr-dao";
    const interpreter = createInterpreter(
      `
      load aragonos as ar

      ar:new-dao ${daoName}
    `,
      client,
    );

    const newDAOActions = await interpreter.interpret();

    const txHash = await walletClient.sendTransaction({
      ...(newDAOActions[0] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    const aragonos = interpreter.getModule("aragonos") as AragonOS;

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });

    const lastLog = receipt.logs.pop();

    expect(lastLog).to.not.be.undefined;

    const newDAOAddress = decodeAbiParameters(
      parseAbiParameters("address"),
      lastLog!.data,
    )[0];

    expect(
      addressesEqual(
        aragonos.bindingsManager.getBindingValue(
          `_${daoName}`,
          BindingsSpace.ADDR,
        )!,
        newDAOAddress,
      ),
      "new DAO binding mismatch",
    ).to.be.true;
  });
});
