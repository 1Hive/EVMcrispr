import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/cas11";

describe("Std > helpers > @token(tokenSymbol)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should interpret it correctly", async () => {
    const [interpret] = await preparingExpression("@token(DAI)", client);

    expect(await interpret()).to.equals(
      "0x44fA8E6f47987339850636F88629646662444217",
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@token",
    ["DAI"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
  );
});

describe("Std > helpers > @token.balance(tokenSymbol, account)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should interpret it correctly", async () => {
    const [interpret] = await preparingExpression(
      "@token.balance(DAI,@token(DAI))",
      client,
    );

    expect(await interpret()).to.be.eq(
      "12100000000000000000", // DAI balance in block 24730000, may change for other blocks
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@token.balance",
    ["DAI", "@token(DAI)"],
    {
      type: ComparisonType.Equal,
      minValue: 2,
    },
    lazyClient,
  );
});

describe("Std > helpers > @token.amount(tokenSymbol, amount)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should interpret it correctly", async () => {
    const [interpret] = await preparingExpression(
      "@token.amount(DAI, 1)",
      client,
    );

    expect(await interpret()).to.equals(String(1e18));
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@token.amount",
    ["DAI", "1"],
    {
      type: ComparisonType.Equal,
      minValue: 2,
    },
    lazyClient,
  );
});
