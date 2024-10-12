import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { HelperFunctionError } from "../../../../src/errors";

describe("Std > helpers > @ens(name)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("return the hashed value", async () => {
    const [interpret] = await preparingExpression(
      `@ens('vitalik.eth')`,
      client,
    );

    expect(await interpret()).to.equals(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });

  it("should fail when ENS name not found", async () => {
    const [interpret, h] = await preparingExpression(
      `@ens('_notfound.eth')`,
      client,
    );
    const error = new HelperFunctionError(
      h,
      "ENS name _notfound.eth not found",
    );

    await expectThrowAsync(async () => interpret(), error);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@ens",
    ["exampleValue"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
  );
});
