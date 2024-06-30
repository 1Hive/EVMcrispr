import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import { ExpressionError } from "../../src/errors";

import { toDecimals } from "../../src/utils";

import { createInterpreter, preparingExpression } from "../test-helpers/cas11";
import { expectThrowAsync } from "../test-helpers/expects";

describe("Interpreter - arithmetics", () => {
  const name = "ArithmeticExpressionError";

  let client: PublicClient;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should return the correct result of an arithmetic operation", async () => {
    const [interpret] = await preparingExpression(
      "(120 - 5e22 * 2 ^ 2 + 500e33)",
      client,
    );
    const res = await interpret();

    expect(res).to.eql(120n - toDecimals(5, 22) * 4n + toDecimals(500, 33));
  });

  it("should return the correct result of an arithmetic operation containing priority parenthesis", async () => {
    const [interpret] = await preparingExpression(
      "((121e18 / 4) * (9 - 2) ^ 2 - 55e18)",
      client,
    );
    const res = await interpret();

    expect(res).to.eql(toDecimals("1427.25", 18));
  });

  it("should fail when one of the operands is not a number", async () => {
    const invalidValue = "a string";
    const leftOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res ($var1 * 2)
  `,
      client,
    );
    const leftOperandNode = leftOperandInterpreter.ast.body[1].args[1];
    const leftOperandErr = new ExpressionError(
      leftOperandNode,
      `invalid left operand. Expected a number but got "${invalidValue}"`,
      { name },
    );

    const rightOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res (2 * $var1)
  `,
      client,
    );
    const rightOperandNode = rightOperandInterpreter.ast.body[1].args[1];
    const rightOperandErr = new ExpressionError(
      rightOperandNode,
      `invalid right operand. Expected a number but got "${invalidValue}"`,
      { name },
    );

    await expectThrowAsync(
      () => leftOperandInterpreter.interpret(),
      leftOperandErr,
      "invalid left operand error",
    );

    await expectThrowAsync(
      () => rightOperandInterpreter.interpret(),
      rightOperandErr,
      "invalid right operand error",
    );
  });

  it("should fail when trying to perform a division by zero", async () => {
    const [interpret, n] = await preparingExpression("(4 / 0)", client);
    const err = new ExpressionError(
      n,
      `invalid operation. Can't divide by zero`,
      { name },
    );

    await expectThrowAsync(() => interpret(), err);
  });
});
