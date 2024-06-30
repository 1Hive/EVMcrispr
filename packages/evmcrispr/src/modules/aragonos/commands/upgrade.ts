import {
  isAddress,
  keccak256,
  namehash,
  parseAbiItem,
  toHex,
  zeroAddress,
} from "viem";

import { ComparisonType, checkArgsLength, encodeAction } from "../../../utils";
import type { ICommand } from "../../../types";
import type { AragonOS } from "../AragonOS";
import { _aragonEns } from "../helpers/aragonEns";
import {
  REPO_ABI,
  SEMANTIC_VERSION_REGEX,
  getDAOAppIdentifiers,
} from "../utils";
import { daoPrefixedIdentifierParser, getDAO } from "../utils/commands";
import { ErrorException } from "../../..";

export const upgrade: ICommand<AragonOS> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 1,
      maxValue: 2,
    });

    const client = await module.getClient();
    const dao = getDAO(module.bindingsManager, c.args[0]);

    const kernel = dao.kernel;

    const args = await Promise.all([
      interpretNode(c.args[0], { treatAsLiteral: true }),
      c.args[1] ? interpretNode(c.args[1]) : undefined,
    ]);
    const rawApmRepo = args[0];
    let newAppAddress = args[1];

    // Check for dao-prefixed identifiers
    const parserRes = daoPrefixedIdentifierParser.run(rawApmRepo);
    let apmRepo = !parserRes.isError ? parserRes.result[1] : rawApmRepo;

    if (
      !apmRepo.endsWith("aragonpm.eth") &&
      !apmRepo.endsWith("open.aragonpm.eth")
    ) {
      apmRepo = `${apmRepo}.aragonpm.eth`;
    }

    const KERNEL_APP_BASE_NAMESPACE = keccak256(toHex("base"));
    const appId = namehash(apmRepo);

    const currentAppAddress = await client.readContract({
      address: kernel.address,
      abi: [
        parseAbiItem(
          "function getApp(bytes32,bytes32) external view returns (address)",
        ),
      ],
      functionName: "getApp",
      args: [KERNEL_APP_BASE_NAMESPACE, appId],
    });

    if (currentAppAddress === zeroAddress) {
      throw new ErrorException(`${apmRepo} not installed on current DAO.`);
    }

    const repoAddr = await _aragonEns(
      apmRepo,
      await module.getClient(),
      module.getConfigBinding("ensResolver"),
    );

    if (!repoAddr) {
      throw new ErrorException(`ENS repo name ${apmRepo} couldn't be resolved`);
    }

    if (!newAppAddress) {
      [, newAppAddress] = await client.readContract({
        address: repoAddr,
        abi: REPO_ABI,
        functionName: "getLatest",
      });
    } else if (SEMANTIC_VERSION_REGEX.test(newAppAddress)) {
      [, newAppAddress] = await client.readContract({
        address: repoAddr,
        abi: REPO_ABI,
        functionName: "getBySemanticVersion",
        args: [newAppAddress.split(".").map((s: string) => parseInt(s))],
      });
    } else if (!isAddress(newAppAddress)) {
      throw new ErrorException(
        "second upgrade parameter must be a semantic version, an address, or nothing",
      );
    }

    return [
      encodeAction(kernel.address, "setApp(bytes32,bytes32,address)", [
        KERNEL_APP_BASE_NAMESPACE,
        appId,
        newAppAddress,
      ]),
    ];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      case 0:
        return getDAOAppIdentifiers(bindingsManager);
      default:
        return [];
    }
  },
  async runEagerExecution() {
    return;
  },
};
