import {
  choice,
  coroutine,
  either,
  endOfInput,
  everyCharUntil,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
} from "arcsecond";

import type {
  CommandArgExpressionNode,
  CommandExpressionNode,
  CommandOptNode,
  Node,
  NodeParser,
} from "../types";
import { NodeType } from "../types";
import { buildParserError } from "../utils/parsers";
import { commentParser } from "./comment";

import { argumentExpressionParser, expressionParser } from "./expression";
import {
  addNewError,
  camelAndKebabCase,
  createNodeLocation,
  enclose,
  endLine,
  endOfLine,
  locate,
  optOperatorParser,
  optionalWhitespace,
  whitespace,
} from "./utils";

type CommandName = {
  module?: string;
  name: string;
};

const COMMAND_NAME_REGEX =
  /^(?:(?<module>[a-zA-Z-]{1,63}(?<!-))(?::))?(?<command>[a-zA-Z-]{1,63}(?<!-))/;

const commandNameParser = enclose(regex(COMMAND_NAME_REGEX))
  .errorMap((err) =>
    buildParserError(
      err,
      COMMAND_PARSER_ERROR,
      "Expecting a valid command name",
    ),
  )
  .map((value): CommandName => {
    const res = COMMAND_NAME_REGEX.exec(value);
    const { module, command } = res?.groups || {};

    const commandName: CommandName = { name: command };

    if (module) commandName.module = module;

    return commandName;
  });

export const commandOptParser: NodeParser<CommandOptNode> =
  locate<CommandOptNode>(
    sequenceOf([
      optOperatorParser,
      enclose(camelAndKebabCase).errorMap((err) =>
        buildParserError(
          err,
          COMMAND_PARSER_ERROR,
          "Expecting a valid option name",
        ),
      ),
      whitespace,
      argumentExpressionParser(),
    ]),
    ({ data, index, result: [initialContext, [, name, , value]] }) => ({
      type: NodeType.CommandOpt,
      name: name as CommandOptNode["name"],
      value: value as CommandOptNode["value"],
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );

const isLastParameter = possibly(
  lookAhead(sequenceOf([optionalWhitespace, choice([endOfLine, endOfInput])])),
);

const commandArgsParser = coroutine((run) => {
  let commandArgOrOpt: CommandArgExpressionNode;

  if (run(possibly(lookAhead(optOperatorParser)))) {
    commandArgOrOpt = run(commandOptParser);
  } else {
    commandArgOrOpt = run(expressionParser());
  }

  return commandArgOrOpt;
});

export const COMMAND_PARSER_ERROR = "CommandParserError";

export const endOfCommandParser = choice([endLine, lookAhead(endOfInput)]);

export const commandExpressionParser: NodeParser<CommandExpressionNode> =
  recursiveParser(() =>
    sequenceOf([
      optionalWhitespace,
      locate<CommandExpressionNode>(
        coroutine((run) => {
          const commandName: CommandName = run(commandNameParser);

          const { name, module } = commandName;

          const commandArgsAndOpts: (
            | CommandArgExpressionNode
            | CommandOptNode
          )[] = [];

          if (
            run(
              possibly(
                lookAhead(
                  sequenceOf([
                    optionalWhitespace,
                    choice([endOfLine, endOfInput]),
                  ]),
                ),
              ),
            )
          ) {
            return [module, name, [], []];
          }

          do {
            /**
             * Check if there's a comment ahead but don't consume it
             * to avoid having an incorrect loc property
             */
            if (run(possibly(lookAhead(commentParser)))) {
              break;
            }

            run(whitespace);

            const res: {
              isError: boolean;
              value: any;
            } = run(either(commandArgsParser));

            if (res.isError) {
              run(addNewError(res.value));
              run(everyCharUntil(choice([whitespace, endOfLine])));
            } else {
              commandArgsAndOpts.push(res.value);
            }
          } while (!run(isLastParameter));

          const args = commandArgsAndOpts.filter(
            (cArg) => cArg.type !== NodeType.CommandOpt,
          );

          const opts = commandArgsAndOpts.filter(
            (cArg) => cArg.type === NodeType.CommandOpt,
          ) as CommandOptNode[];

          return [module, name, args, opts];
        }),
        ({
          data,
          index,
          result: [initialContext, [module, name, args, opts]],
        }) => ({
          type: NodeType.CommandExpression,
          ...(module ? { module } : {}),
          name: name as string,
          args: args as Node[],
          opts: opts as CommandOptNode[],
          loc: createNodeLocation(initialContext, {
            line: data.line,
            index,
            offset: data.offset,
          }),
        }),
      ),
      choice([
        commentParser,
        sequenceOf([optionalWhitespace, endOfCommandParser]),
      ]),
    ]).map(([, commandNode]) => {
      return commandNode;
    }),
  );
