import type { PublicClient } from "viem";
import { getAbiItem, hexToString, namehash, toHex } from "viem";

import { ErrorException } from "../../../errors";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  encodeCalldata,
  getOptValue,
  inSameLineThanNode,
  interpretNodeSync,
  tryAndCacheNotFound,
} from "../../../utils";
import type { Address, ICommand, Nullable } from "../../../types";
import { BindingsSpace } from "../../../types";
import type { AragonOS } from "../AragonOS";
import { _aragonEns } from "../helpers/aragonEns";
import {
  REPO_ABI,
  SEMANTIC_VERSION_REGEX,
  buildAppArtifact,
  buildAppPermissions,
  buildArtifactFromABI,
  fetchAppArtifact,
  getDAOs,
  isLabeledAppIdentifier,
  parseLabeledAppIdentifier,
} from "../utils";
import { DAO_OPT_NAME, getDAOByOption } from "../utils/commands";
import type { App, AppArtifact } from "../types";
import type { AragonDAO } from "../AragonDAO";
import type { BindingsManager } from "../../../BindingsManager";

const { ABI, ADDR, OTHER } = BindingsSpace;

const fetchRepoData = async (
  appName: string,
  appRegistry: string,
  appVersion = "latest",
  client: PublicClient,
  customEnsResolver?: Address,
): Promise<{ codeAddress: Address; contentUri: string }> => {
  const repoENSName = `${appName}.${appRegistry}`;
  const repoAddr = await _aragonEns(repoENSName, client, customEnsResolver);

  if (!repoAddr) {
    throw new ErrorException(
      `ENS repo name ${repoENSName} couldn't be resolved`,
    );
  }

  const repo = REPO_ABI;
  let codeAddress, rawContentUri;

  if (appVersion && appVersion !== "latest") {
    if (!SEMANTIC_VERSION_REGEX.test(appVersion)) {
      throw new ErrorException(
        `invalid --version option. Expected a semantic version, but got ${appVersion}`,
      );
    }

    [, codeAddress, rawContentUri] = await client.readContract({
      address: repoAddr,
      abi: repo,
      functionName: "getBySemanticVersion",
      args: [appVersion.split(".").map(Number) as [number, number, number]],
    });
  } else {
    [, codeAddress, rawContentUri] = await client.readContract({
      address: repoAddr,
      abi: repo,
      functionName: "getLatest",
    });
  }

  return { codeAddress, contentUri: hexToString(rawContentUri) };
};

const setApp = (
  dao: AragonDAO,
  app: App,
  artifact: AppArtifact,
  bindingsManager: BindingsManager,
): void => {
  dao.appArtifactCache.set(app.codeAddress, artifact);
  dao.appCache.set(app.name, app);

  bindingsManager.setBinding(
    app.codeAddress,
    app.abi,
    ABI,
    false,
    undefined,
    true,
  );
  bindingsManager.setBinding(app.address, app.abi, ABI, false, undefined, true);

  if (!bindingsManager.hasBinding(app.name, ADDR)) {
    bindingsManager.setBinding(app.name, app.address, ADDR);
  }
};

export const install: ICommand<AragonOS> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });
    checkOpts(c, [DAO_OPT_NAME, "version"]);

    const dao = await getDAOByOption(c, module.bindingsManager, interpretNode);

    const [identifierNode, ...paramNodes] = c.args;
    const identifier = await interpretNode(identifierNode, {
      treatAsLiteral: true,
    });
    const version = await getOptValue(c, "version", interpretNode);
    const [appName, registry] = parseLabeledAppIdentifier(identifier);

    if (dao.appCache.has(identifier)) {
      throw new ErrorException(`identifier ${identifier} is already in use.`);
    }

    const { codeAddress, contentUri } = await fetchRepoData(
      appName,
      registry,
      version ?? "latest",
      await module.getClient(),
      module.getConfigBinding("ensResolver"),
    );

    const daos = getDAOs(module.bindingsManager);
    const selectedDAOArtifacts = daos
      .filter((dao) => dao.appArtifactCache.has(codeAddress))
      .map((dao) => dao.appArtifactCache.get(codeAddress)!);
    let artifact: AppArtifact;

    if (!selectedDAOArtifacts.length) {
      const rawArtifact = await fetchAppArtifact(
        module.ipfsResolver,
        contentUri,
      );
      artifact = buildAppArtifact(rawArtifact);
    } else {
      artifact = selectedDAOArtifacts[0];
    }

    const { abi, roles } = artifact;
    const kernel = dao.kernel;
    const initParams = await interpretNodes(paramNodes);

    const fnFragment = getAbiItem({
      name: "initialize",
      abi,
    });

    if (!fnFragment || fnFragment.type !== "function") {
      throw new ErrorException(
        `initialize function not found in ${identifier}`,
      );
    }

    const encodedInitializeFunction = encodeCalldata(fnFragment, initParams);

    const appId = namehash(`${appName}.${registry}`);
    if (!module.bindingsManager.getBindingValue(identifier, ADDR)) {
      await module.registerNextProxyAddress(identifier, kernel.address);
    }
    const proxyContractAddress = module.bindingsManager.getBindingValue(
      identifier,
      ADDR,
    )!;

    setApp(
      dao,
      {
        abi,
        address: proxyContractAddress,
        codeAddress,
        contentUri,
        name: identifier,
        permissions: buildAppPermissions(roles, []),
        registryName: registry,
      },
      artifact,
      module.bindingsManager,
    );

    return [
      encodeAction(
        kernel.address,
        "newAppInstance(bytes32,address,bytes,bool)",
        [appId, codeAddress, encodedInitializeFunction, false],
      ),
    ];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      default: {
        /**
         * Only provide suggestions for the new app initialize function
         * parameters
         */
        if (argIndex > 0) {
          const identifiers = bindingsManager.getAllBindingIdentifiers({
            spaceFilters: [ADDR],
          });
          return identifiers;
        }

        return [];
      }
    }
  },
  async runEagerExecution(c, cache, { client, ipfsResolver }, caretPos) {
    if (inSameLineThanNode(c, caretPos)) {
      return;
    }
    const repoNode = c.args[0];

    const labeledAppIdentifier = repoNode.value;

    // Skip over if no valid labeled app identifer was provided
    if (!isLabeledAppIdentifier(labeledAppIdentifier)) {
      return;
    }
    const [appName, appRegistry] =
      parseLabeledAppIdentifier(labeledAppIdentifier);
    let artifact: AppArtifact,
      proxyAddress: Nullable<Address> | undefined,
      codeAddress: Nullable<Address> | undefined;

    proxyAddress = cache.getBindingValue(labeledAppIdentifier, OTHER) as
      | Address
      | undefined;
    if (proxyAddress) {
      codeAddress = cache.getBindingValue(proxyAddress, OTHER) as
        | Address
        | undefined;
    }

    if (!codeAddress) {
      const repoData = await tryAndCacheNotFound(
        () => fetchRepoData(appName, appRegistry, "latest", client),
        `${appName}.${appRegistry}`,
        ADDR,
        cache,
      );

      if (!repoData) {
        return;
      }

      codeAddress = repoData.codeAddress;
      // Check if there's already an ABI for this implementation
      const abi = cache.getBindingValue(codeAddress, ABI);

      if (!abi) {
        const rawArtifact = await tryAndCacheNotFound(
          () => fetchAppArtifact(ipfsResolver, repoData.contentUri),
          codeAddress,
          ABI,
          cache,
        );

        if (!rawArtifact) {
          return;
        }

        artifact = buildAppArtifact(rawArtifact);
        // Create a random address for the proxy since it's executed in eager mode
        // This is to avoid conflicts with the proxy address that might be set by
        // the user
        proxyAddress = toHex(crypto.getRandomValues(new Uint8Array(20)));
        // Cache fetched ABI
        cache.setBinding(codeAddress, artifact.abi, ABI);

        /**
         * Cache both mock proxy address and code address so we can
         * retrieve the app's ABI on following executions
         */
        cache.setBinding(labeledAppIdentifier, proxyAddress, OTHER);
        cache.setBinding(proxyAddress, codeAddress, OTHER);
      } else {
        artifact = buildArtifactFromABI(appName, appRegistry, abi);
      }
    } else {
      const abi = cache.getBindingValue(codeAddress, ABI)!;
      artifact = buildArtifactFromABI(appName, appRegistry, abi);
    }

    return (eagerBindingsManager) => {
      const daoOpt = c.opts.find((opt) => opt.name === "dao");
      const daoOptValue = daoOpt
        ? interpretNodeSync(daoOpt, eagerBindingsManager)
        : undefined;
      const dao = eagerBindingsManager.getBindingValue(
        daoOptValue ?? "currentDAO",
        BindingsSpace.DATA_PROVIDER,
      ) as AragonDAO | undefined;

      if (!dao) {
        return;
      }

      const app: App = {
        abi: artifact.abi,
        address: proxyAddress!,
        codeAddress: codeAddress!,
        contentUri: "",
        name: labeledAppIdentifier,
        permissions: buildAppPermissions(artifact.roles, []),
        registryName: appRegistry,
      };

      setApp(dao, app, artifact, eagerBindingsManager);
    };
  },
};
