import type {
  Cas11AST,
  CommandExpressionNode,
  ICommand,
  IPFSResolver,
  LazyBindings,
  ModuleBinding,
  ModuleData,
  NoNullableBinding,
  Position,
} from "@1hive/evmcrispr";
import {
  BindingsManager,
  BindingsSpace,
  NodeType,
  calculateCurrentArgIndex,
  getDeepestNodeWithArgs,
  hasCommandsBlock,
  parseScript,
} from "@1hive/evmcrispr";
import type { IRange } from "monaco-editor";
import { languages } from "monaco-editor";

import type { PublicClient } from "viem";
import { isAddress } from "viem";

import { DEFAULT_MODULE_BINDING } from "../../utils";

import { shortenAddress } from "../../utils/web3";

const { Field, Property, Variable } = languages.CompletionItemKind;
type CompletionItem = languages.CompletionItem;
type AllEagerExecParams = Parameters<Required<ICommand>["runEagerExecution"]>;
type EagerExecParams = [
  AllEagerExecParams[1],
  AllEagerExecParams[2],
  AllEagerExecParams[3],
];

export type ModulesRegistry = Record<
  string,
  { data: ModuleData; alias: string }
>;

const { ALIAS, MODULE, USER } = BindingsSpace;

const runLoadCommands = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  eagerBindingsManager.setBindings(DEFAULT_MODULE_BINDING);

  const loadCommandNodes = commandNodes.filter((c) =>
    ["load", "std:load"].includes(c.name),
  );

  await runEagerExecutions(
    loadCommandNodes,
    eagerBindingsManager,
    ...eagerFnParams,
  );
};

const buildModuleCompletionItems = (
  eagerBindingsManager: BindingsManager,
  range: IRange,
): {
  commandCompletionItems: CompletionItem[];
  helperCompletionItems: CompletionItem[];
} => {
  const scopeModule =
    eagerBindingsManager.getScopeModule() ?? DEFAULT_MODULE_BINDING.identifier;

  const moduleBindings = eagerBindingsManager.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const moduleAliases = moduleBindings
    .filter((b) => !!b.value)
    .map(
      ({ identifier }) =>
        eagerBindingsManager.getBindingValue(identifier, ALIAS) ?? identifier,
    );

  return {
    commandCompletionItems: moduleBindings.flatMap(
      ({ value: module }, index) => {
        const moduleAlias = moduleAliases[index];
        return Object.keys(module.commands)
          .map(
            (commandName) =>
              `${
                scopeModule === moduleAlias ? "" : `${moduleAlias}:`
              }${commandName}`,
          )
          .map((name) => ({
            label: name,
            insertText: name,
            kind: 1,
            range,
          }));
      },
    ),

    // TODO: add prefixes to helpers after it's supported on parsers
    helperCompletionItems: moduleBindings.flatMap(({ value: module }) => {
      return Object.keys(module.helpers)
        .map((helperName) => `@${helperName}`)
        .map((name) => ({
          label: name,
          insertText: `${name}()`,
          kind: Property,
          sortText: "3",
          range,
        }));
    }),
  };
};

const buildVarCompletionItems = (
  eagerBindingsManager: BindingsManager,
  range: IRange,
  currentPos: Position,
  currentCommandNode?: CommandExpressionNode,
): CompletionItem[] => {
  let varNames = eagerBindingsManager.getAllBindingIdentifiers({
    spaceFilters: [USER],
  });

  if (currentCommandNode && currentCommandNode.name === "set") {
    const currentArgIndex = calculateCurrentArgIndex(
      currentCommandNode,
      currentPos,
    );
    // Don't return suggestions for a variable declaration
    if (currentArgIndex === 0) {
      return [];
      // Don't return the current declared variable as a suggestion
    } else if (currentArgIndex === 1) {
      const currentVarName = currentCommandNode.args[0].value;
      varNames = varNames.filter(
        (varName: string) => varName !== currentVarName,
      );
    }
  }

  return varNames.map(
    (name: string): CompletionItem => ({
      label: name,
      insertText: name,
      kind: Variable,
      sortText: "2",
      range,
    }),
  );
};

const buildCurrentArgCompletionItems = (
  eagerBindingsManager: BindingsManager,
  currentCommandNode: CommandExpressionNode,
  parentModule: string,
  range: IRange,
  currentPos: Position,
): CompletionItem[] => {
  let currentArgCompletionItems: CompletionItem[] = [];

  const lastCommand = resolveCommandNode(
    currentCommandNode,
    eagerBindingsManager,
    parentModule,
  );

  if (lastCommand) {
    currentArgCompletionItems = lastCommand
      .buildCompletionItemsForArg(
        calculateCurrentArgIndex(currentCommandNode, currentPos),
        currentCommandNode.args,
        eagerBindingsManager,
        currentPos,
      )
      .map((identifier: string) => ({
        label: isAddress(identifier) ? shortenAddress(identifier) : identifier,
        insertText: identifier,
        range,
        sortText: "1",
        kind: Field,
      }));
  }

  return currentArgCompletionItems;
};

const calculateCommandNameLength = (c: CommandExpressionNode) => {
  const offset = c.loc?.start.col ?? 0;
  // Take into account colon as well
  const moduleNameLength = (c.module ?? "").length;
  const colonLength = c.module ? 1 : 0;

  return offset + moduleNameLength + colonLength + c.name.length;
};

export const runEagerExecutions = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  let parentCommandModule = DEFAULT_MODULE_BINDING.identifier;
  /**
   * Keep track of commands' modules across nested command blocks
   */
  const commandToModule = commandNodes.reduce<string[]>(
    (commandToModule, c) => {
      if (hasCommandsBlock(c)) {
        parentCommandModule = c.module ?? parentCommandModule;
      }
      commandToModule.push(c.module ?? parentCommandModule);
      return commandToModule;
    },
    [],
  );

  const executedCommands = new Set<string>();
  // Prepare all eager run functions
  const commandEagerExecutionFns = [...commandNodes]
    /**
     * Reverse the command list in order to keep track of
     * the first executed command of every type
     */
    .reverse()
    .map((c, index) => {
      const commandModule = commandToModule[commandToModule.length - 1 - index];
      const commandFullName = `${commandModule}:${c.name}`;

      const command = resolveCommandNode(
        c,
        eagerBindingsManager,
        commandModule,
      );

      if (!command) {
        return;
      }

      const isClosestCommandToCaret = !executedCommands.has(commandFullName);

      try {
        const eagerFn = command.runEagerExecution(
          c,
          ...eagerFnParams,
          isClosestCommandToCaret,
        );
        executedCommands.add(commandFullName);

        return eagerFn;
        // eslint-disable-next-line no-empty
      } catch (_err) {
        return;
      }
    });

  // Execute them all at once
  const lazyBindingResolvers = (
    await Promise.all(commandEagerExecutionFns)
  ).filter<LazyBindings>((b): b is LazyBindings => !!b);

  // Populate the eager bindings manager by resolving the lazy bindings
  lazyBindingResolvers
    /**
     * Reverse back the lazy binding resolvers so we execute them
     * in the the order the original commands were given
     */
    .reverse()
    .forEach((resolveLazyBinding) => {
      try {
        resolveLazyBinding(eagerBindingsManager);
        // eslint-disable-next-line no-empty
      } catch (_err) {}
    });
};

export const resolveCommandNode = (
  c: CommandExpressionNode,
  eagerBindingsManager: BindingsManager,
  parentModule: string,
): ICommand | undefined => {
  const moduleName =
    c.module ?? parentModule ?? DEFAULT_MODULE_BINDING.identifier;

  const resolvedModuleName =
    eagerBindingsManager.getBindingValue(moduleName, ALIAS) ?? moduleName;

  const module = eagerBindingsManager.getBindingValue(
    resolvedModuleName,
    MODULE,
  );

  if (!module) {
    return;
  }

  return module.commands[c.name];
};

const removePossibleFollowingBlock = (
  currentLine: string,
  currPos: Position,
): string => {
  const matchIndexes = ["(", ")"]
    .map((char) => currentLine.indexOf(char))
    .filter((n) => n > -1 && n >= currPos.col);

  if (!matchIndexes.length) {
    return currentLine;
  }

  const endMark = Math.min(...matchIndexes);

  return currentLine.slice(0, endMark);
};

export const createProvideCompletionItemsFn: (
  bindingsCache: BindingsManager,
  fetchers: { ipfsResolver: IPFSResolver; client: PublicClient },
  ast?: Cas11AST,
) => languages.CompletionItemProvider["provideCompletionItems"] =
  (bindingsCache, { ipfsResolver, client }, ast) =>
  async (model, currPos) => {
    const currentLineContent = model.getLineContent(currPos.lineNumber);
    const { startColumn, endColumn } = model.getWordUntilPosition(currPos);
    const range: IRange = {
      startLineNumber: currPos.lineNumber,
      endLineNumber: currPos.lineNumber,
      startColumn: startColumn,
      // If word exists retrieve the end column of the whole word
      endColumn: model.getWordAtPosition(currPos)?.endColumn ?? endColumn,
    };
    // Monaco editor positions start at 1
    const calibratedCurrPos: Position = {
      col: currPos.column - 1,
      line: currPos.lineNumber,
    };
    const eagerBindingsManager = new BindingsManager();

    if (!ast) {
      return;
    }

    const { ast: currentLineAST } = parseScript(
      [
        /**
         * Add previous lines to keep the correct
         * current line location
         */
        ...Array(currPos.lineNumber - 1).map(() => ""),
        /**
         * Remove any following unfinished commands block so we can parse
         * the line gracefully
         */
        // TODO: Remove this fn after implementing blank spaces in parser for possible errors
        removePossibleFollowingBlock(currentLineContent, calibratedCurrPos),
      ].join("\n"),
    );

    const currentCommandNode = currentLineAST.getCommandAtLine(
      calibratedCurrPos.line,
    );

    // TODO: Maybe we should
    const { arg: currentArg } = currentCommandNode
      ? getDeepestNodeWithArgs(currentCommandNode, calibratedCurrPos)
      : { arg: undefined };

    if (
      currentCommandNode &&
      currentArg &&
      currentArg.type === NodeType.StringLiteral
    ) {
      return {
        suggestions: [],
      };
    }

    let contextModuleName = "std";
    // Get command nodes until caret position
    const commandNodes: CommandExpressionNode[] = ast
      .getCommandsUntilLine(calibratedCurrPos.line - 1, ["load", "set"])
      /**
       * Filter out any command with a commands block that doesn't
       * contain the current caret
       */
      .filter((c: any) => {
        const itHasCommandsBlock = hasCommandsBlock(c);
        const loc = c.loc;
        const currentLine = calibratedCurrPos.line;
        if (
          !itHasCommandsBlock ||
          (itHasCommandsBlock &&
            loc &&
            currentLine >= loc.start.line &&
            currentLine <= loc.end.line)
        ) {
          if (itHasCommandsBlock) {
            contextModuleName = c.module ?? contextModuleName;
          }
          return true;
        }

        return false;
      });

    // Build module bindings
    await runLoadCommands(
      commandNodes,
      eagerBindingsManager,
      bindingsCache,
      { client, ipfsResolver },
      calibratedCurrPos,
    );

    // Resolve variables
    await runEagerExecutions(
      commandNodes.filter((c) => ["set", "std:set"].includes(c.name)),
      eagerBindingsManager,
      bindingsCache,
      { ipfsResolver, client },
      calibratedCurrPos,
    );

    const filteredCommandNodes = commandNodes
      // Filter out load command nodes previously resolved
      .filter((c) => !["load", "std:load", "set", "std:set"].includes(c.name));

    await runEagerExecutions(
      currentCommandNode
        ? [...filteredCommandNodes, currentCommandNode]
        : filteredCommandNodes,
      eagerBindingsManager,
      bindingsCache,
      { client, ipfsResolver },
      calibratedCurrPos,
    );

    // Build module completion items
    const { commandCompletionItems, helperCompletionItems } =
      buildModuleCompletionItems(eagerBindingsManager, range);
    const emptyLine = !currentLineContent.trim().length;

    const displayCommandSuggestions =
      emptyLine ||
      // Check if caret position is within the command name location
      (!!currentCommandNode?.loc &&
        calibratedCurrPos.col >= 0 &&
        calibratedCurrPos.col <=
          calculateCommandNameLength(currentCommandNode));

    if (displayCommandSuggestions) {
      return {
        suggestions: commandCompletionItems,
      };
    }

    const variableCompletionItems = buildVarCompletionItems(
      eagerBindingsManager,
      range,
      calibratedCurrPos,
      currentCommandNode,
    );
    let currentArgCompletionItems: languages.CompletionItem[] = [];

    if (currentCommandNode) {
      currentArgCompletionItems = buildCurrentArgCompletionItems(
        eagerBindingsManager,
        currentCommandNode,
        contextModuleName,
        range,
        calibratedCurrPos,
      );
    }
    // TODO: Only display identifiers when located inside a
    // node with args which may not be completed , e.g.
    // @helper(a, <here>).
    // Need to update parser to support incorrect expressions
    // and add <empty-error> on those situations
    else {
      currentArgCompletionItems = eagerBindingsManager
        .getAllBindingIdentifiers({
          spaceFilters: [BindingsSpace.ADDR],
        })
        .map((identifier: string) => ({
          insertText: identifier,
          label: identifier,
          kind: languages.CompletionItemKind.Field,
          range,
          sortText: "1",
        }));
    }

    return {
      suggestions: [
        ...currentArgCompletionItems,
        ...helperCompletionItems,
        ...variableCompletionItems,
      ],
    };
  };
