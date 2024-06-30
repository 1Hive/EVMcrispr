import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";

import type { Action } from "../../../../src/types";
import { oracle } from "../../../../src/modules/aragonos/utils";

import type { AragonOS } from "../../../../src/modules/aragonos/AragonOS";

import { CommandError } from "../../../../src/errors";

import { DAO } from "../../../fixtures";
import { DAO as DAO2 } from "../../../fixtures/mock-dao-2";
import { createTestAction } from "../test-helpers/actions";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
  itChecksBadPermission,
} from "../test-helpers/aragonos";
import { createInterpreter } from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { TEST_ACCOUNT_ADDRESS } from "../../../test-helpers/constants";

describe("AragonOS > commands > grant <entity> <app> <role> [permissionManager] [--params <acl params> | --oracle <aclOracleAddress>]", () => {
  let client: PublicClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  before(async () => {
    client = await viem.getPublicClient();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      client,
      DAO.kernel,
    );
  });

  it("should return a correct grant permission action", async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant @me agent TRANSFER_ROLE`,
    ]);

    const granteeActions = await interpreter.interpret();

    const expectedGranteeActions = [
      createTestAction("grantPermission", DAO.acl, [
        TEST_ACCOUNT_ADDRESS,
        DAO.agent,
        keccak256(toHex("TRANSFER_ROLE")),
      ]),
    ];
    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp("agent");
    const grantees = app?.permissions?.get(
      keccak256(toHex("TRANSFER_ROLE")),
    )?.grantees;

    expect(granteeActions, "Returned actions mismatch").to.eqls(
      expectedGranteeActions,
    );
    expect(
      grantees,
      "Grantee wasn't found on DAO app's permissions",
    ).to.include(TEST_ACCOUNT_ADDRESS);
  });

  it("should return a correct create permission action", async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant disputable-voting.open wrappable-hooked-token-manager.open WRAP_TOKEN_ROLE @me`,
    ]);

    const createPermissionAction = await interpreter.interpret();

    const expectedPermissionManager = TEST_ACCOUNT_ADDRESS;
    const expectedCreatePermissionActions = [
      createTestAction("createPermission", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO["wrappable-hooked-token-manager.open"],
        keccak256(toHex("WRAP_TOKEN_ROLE")),
        expectedPermissionManager,
      ]),
    ];
    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp("wrappable-hooked-token-manager.open");
    const permission = app?.permissions?.get(
      keccak256(toHex("WRAP_TOKEN_ROLE")),
    );

    expect(createPermissionAction, "Returned actions mismatch").to.eql(
      expectedCreatePermissionActions,
    );
    expect(
      permission?.grantees,
      "Grantee wasn't found on DAO app's permission",
    ).to.have.key(DAO["disputable-voting.open"]);
    expect(
      permission?.manager,
      "DAO app's permission manager mismatch",
    ).to.equals(expectedPermissionManager);
  });

  it("should return a correct parametric permission action when receiving an oracle option", async () => {
    const interpreter = createAragonScriptInterpreter([
      "grant disputable-voting.open wrappable-hooked-token-manager.open WRAP_TOKEN_ROLE disputable-voting.open --oracle wrappable-hooked-token-manager.open",
    ]);

    const grantPActions = await interpreter.interpret();

    const expectedActions: Action[] = [
      createTestAction("createPermission", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO["wrappable-hooked-token-manager.open"],
        keccak256(toHex("WRAP_TOKEN_ROLE")),
        DAO["disputable-voting.open"],
      ]),
      createTestAction("grantPermissionP", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO["wrappable-hooked-token-manager.open"],
        keccak256(toHex("WRAP_TOKEN_ROLE")),
        oracle(DAO["wrappable-hooked-token-manager.open"])(),
      ]),
    ];

    expect(grantPActions).to.eql(expectedActions);
  });

  it(`should return a correct grant permission action from a different DAO app`, async () => {
    const interpreter = createInterpreter(
      `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            grant disputable-voting.open _${DAO.kernel}:disputable-voting.open CREATE_VOTES_ROLE
          )
        )
      `,
      client,
    );

    const grantActions = await interpreter.interpret();

    const expectedGrantActions = [
      createTestAction("grantPermission", DAO.acl, [
        DAO2["disputable-voting.open"],
        DAO["disputable-voting.open"],
        keccak256(toHex("CREATE_VOTES_ROLE")),
      ]),
    ];

    expect(grantActions).to.eql(expectedGrantActions);
  });

  itChecksBadPermission("grant", (badPermission) =>
    createAragonScriptInterpreter([`grant ${badPermission.join(" ")}`]),
  );

  it("should fail when passing an invalid app DAO prefix", async () => {
    const invalidDAOPrefix = `invalid-dao-prefix`;
    const appIdentifier = `_${invalidDAOPrefix}:token-manager`;
    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            grant _${DAO.kernel}:disputable-voting.open ${appIdentifier} SOME_ROLE
          )
        )
      `,
      client,
    );
    const c = findAragonOSCommandNode(interpreter.ast, "grant", 1)!;
    const error = new CommandError(
      c,
      `couldn't found a DAO for ${invalidDAOPrefix} on given identifier ${appIdentifier}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when providing an invalid oracle option", async () => {
    const invalidOracle = "invalid-oracle";
    const interpreter = createAragonScriptInterpreter([
      `grant disputable-voting.open wrappable-hooked-token-manager.open REVOKE_VESTINGS_ROLE disputable-voting.open --oracle ${invalidOracle}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
    const error = new CommandError(
      c,
      `invalid --oracle option. Expected an address, but got ${invalidOracle}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when granting a parametric permission to an existent grantee", async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant augmented-bonding-curve.open wrappable-hooked-token-manager.open MINT_ROLE --oracle wrappable-hooked-token-manager.open`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
    const error = new CommandError(
      c,
      `grantee ${DAO["augmented-bonding-curve.open"]} already has given permission on app wrappable-hooked-token-manager`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos as ar

    ar:grant 0xc59d4acea08cf51974dfeb422964e6c2d7eb906f 0x1c06257469514574c0868fdcb83c5509b5513870 TRANSFER_ROLE
  `,
      client,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'must be used within a "connect" command',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when granting a permission to an address that already has it", async () => {
    const app = "wrappable-hooked-token-manager.open";
    const interpreter = createAragonScriptInterpreter([
      `grant augmented-bonding-curve.open ${app} MINT_ROLE`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
    const error = new CommandError(
      c,
      `grantee already has given permission on app ${app.slice(
        0,
        app.indexOf("."),
      )}`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
