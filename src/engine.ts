// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { cloneDeep, pick } from "lodash";
import { err, ok, Result } from "neverthrow";
import { InvalidChoiceError, MissingRequiredArgumentError, MissingRequiredOptionError, UnknownArgumentError, UnknownCommandError, UnknownOptionError } from "./error";
import { DefaultHelper } from "./helper";
import { ConsoleLogger, Logger } from "./logger";
import {
  CLICommand,
  CLICommandArgument,
  CLICommandOption,
  CLIContext,
  CLIFoundCommand,
  CLIHelper,
} from "./type";

function editDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  // Create a 2D array to store the edit distances
  const dp: number[][] = new Array(len1 + 1).fill(0).map(() => new Array(len2 + 1).fill(0));

  // Initialize the first row and column
  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }

  // Calculate the edit distance using dynamic programming
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // Deletion
        dp[i][j - 1] + 1, // Insertion
        dp[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return dp[len1][len2];
}

export class CLIEngine {

  logger: Logger;
  helper: CLIHelper;


  constructor(logger: Logger = new ConsoleLogger(), helper: CLIHelper = new DefaultHelper()) {
    this.logger = logger;
    this.helper = helper;
  }

  /**
   * detect whether the process is a bundled electrop app
   */
  isBundledElectronApp(): boolean {
    return process.versions && process.versions.electron && !(process as any).defaultApp
      ? true
      : false;
  }

  /**
   * entry point of the CLI engine
   */
  async start(rootCmd: CLICommand ): Promise<Result<undefined, Error>> {
    const root = cloneDeep(rootCmd);

    // get user args
    const args = this.isBundledElectronApp() ? process.argv.slice(1) : process.argv.slice(2);
    this.logger.debug(`user argument list: ${JSON.stringify(args)}`);

    // find command
    const findRes = this.findCommand(rootCmd, args);
    const foundCommand = findRes.cmd;
    const remainingArgs = findRes.remainingArgs;
    this.logger.debug(`matched command: ${foundCommand.fullName}`);

    const context: CLIContext = {
      command: foundCommand,
      optionValues: {},
      globalOptionValues: {},
      argumentValues: [],
      telemetryProperties: { },
    };

    // parse args
    const parseRes = this.parseArgs(context, root, remainingArgs);
    if (parseRes.isErr()) {
      return err(parseRes.error);
    }


    // validate
    const validateRes = this.validateOptionsAndArguments(context.command);
    if (validateRes.isErr()) {
      return err(validateRes.error);
    }

    foundCommand.afterParseArgs?.(context);

    // version
    if (context.globalOptionValues.version === true) {
      this.logger.info(root.version ?? "1.0.0");
      return ok(undefined);
    }

    // help
    if (context.globalOptionValues.help === true) {
      const helpText = this.helper.formatHelp(
        context.command,
        context.command.fullName !== root.fullName ? root : undefined
      );
      this.logger.info(helpText);
      return ok(undefined);
    }

    this.logger.debug(
      `parsed context: ${JSON.stringify(
        pick(context, [
          "optionValues",
          "globalOptionValues",
          "argumentValues",
        ]),
        null,
        2
      )}`
    );


    try {
      // run handler
      if (context.command.execute) {
        const handleRes = await context.command.execute(context);
        if (handleRes.isErr()) {
          return err(handleRes.error);
        }
      } else {
        const helpText = this.helper.formatHelp(context.command, root);
        this.logger.info(helpText);
      }
    } catch (e) {
      return err(e as Error);
    }

    return ok(undefined);
  }

  isTelemetryEnabled(context?: CLIContext) {
    return context?.globalOptionValues.telemetry === false ? false : true;
  }
 

  findCommand(
    model: CLICommand,
    args: string[]
  ): { cmd: CLIFoundCommand; remainingArgs: string[] } {
    let i = 0;
    let cmd = model;
    let token: string | undefined;
    for (; i < args.length; i++) {
      token = args[i];
      const command = cmd.commands?.find(
        (c) => c.name === token || (token && c.aliases?.includes(token))
      );
      if (command) {
        cmd = command;
      } else {
        break;
      }
    }
    const command: CLIFoundCommand = {
      fullName: [model.name, ...args.slice(0, i)].join(" "),
      ...cloneDeep(cmd),
    };
    return { cmd: command, remainingArgs: args.slice(i) };
  }

  optionInputKey(option: CLICommandOption | CLICommandArgument) {
    return option.questionName || option.name;
  }

  findMostSimilarCommand(context: CLIContext, token: string): CLICommand | undefined {
    let mini = token.length;
    let mostSimilarCommand: CLICommand | undefined = undefined;
    for (const cmd of context.command.commands || []) {
      const d = editDistance(token, cmd.name);
      if (d < mini && d <= 2) {
        mini = d;
        mostSimilarCommand = cmd;
      }
    }
    return mostSimilarCommand;
  }

  parseArgs(
    context: CLIContext,
    rootCommand: CLICommand,
    args: string[]
  ): Result<undefined, UnknownOptionError | UnknownCommandError | UnknownArgumentError> {
    let argumentIndex = 0;
    const command = context.command;
    const options = (rootCommand.options || []).concat(command.options || []);
    const optionName2OptionMap = new Map<string, CLICommandOption>();
    options.forEach((option) => {
      optionName2OptionMap.set(option.name, option);
      if (option.shortName) {
        optionName2OptionMap.set(option.shortName, option);
      }
    });
    const remainingArgs = cloneDeep(args);
    const findOption = (token: string) => {
      if (token.startsWith("-") || token.startsWith("--")) {
        const trimmedToken = token.startsWith("--") ? token.substring(2) : token.substring(1);
        let key: string;
        let value: string | undefined;
        if (trimmedToken.includes("=")) {
          [key, value] = trimmedToken.split("=");
          //process key, value
          remainingArgs.unshift(value);
        } else {
          key = trimmedToken;
        }
        const option = optionName2OptionMap.get(key);
        return {
          key: key,
          value: value,
          option: option,
        };
      }
      return undefined;
    };
    while (remainingArgs.length) {
      const token = remainingArgs.shift();
      if (!token) continue;
      if (token.startsWith("-") || token.startsWith("--")) {
        const findOptionRes = findOption(token);
        if (findOptionRes?.option) {
          const option = findOptionRes.option;
          if (option.type === "boolean") {
            // boolean: try next token
            const nextToken = remainingArgs[0];
            if (nextToken) {
              if (nextToken.toLowerCase() === "false") {
                option.value = false;
                remainingArgs.shift();
              } else if (nextToken.toLowerCase() === "true") {
                option.value = true;
                remainingArgs.shift();
              } else {
                // not a boolean value, no matter what next token is, current option value is true
                option.value = true;
              }
            } else {
              option.value = true;
            }
          } else if (option.type === "string") {
            // string
            const nextToken = remainingArgs[0];
            if (nextToken) {
              const findNextOptionRes = findOption(nextToken);
              if (findNextOptionRes?.option) {
                // next token is an option, current option value is undefined
              } else {
                option.value = nextToken;
                remainingArgs.shift();
              }
            }
          } else {
            // array
            const nextToken = remainingArgs[0];
            if (nextToken) {
              const findNextOptionRes = findOption(nextToken);
              if (findNextOptionRes?.option) {
                // next token is an option, current option value is undefined
              } else {
                if (option.value === undefined) {
                  option.value = [];
                }
                const values = nextToken.split(",");
                for (const v of values) {
                  option.value.push(v);
                }
                remainingArgs.shift();
              }
            }
          }
          const isCommandOption =
            command.options?.includes(option) &&
            command.fullName !== rootCommand.fullName;
          const inputValues = isCommandOption ? context.optionValues : context.globalOptionValues;
          const inputKey = this.optionInputKey(option);
          const logObject = {
            token: token,
            option: option.name,
            value: option.value,
            isGlobal: !isCommandOption,
          };
          if (option.value !== undefined) inputValues[inputKey] = option.value;
          this.logger.debug(`find option: ${JSON.stringify(logObject)}`);
        } else {
          return err(new UnknownOptionError(command.fullName, token));
        }
      } else {
        if (command.arguments && command.arguments[argumentIndex]) {
          const argument = command.arguments[argumentIndex];
          if (argument.type === "array") {
            argument.value = token.split(",");
          } else if (argument.type === "string") {
            argument.value = token;
          } else {
            argument.value = Boolean(token);
          }
          context.argumentValues.push(argument.value);
          argumentIndex++;
        } else {
          if (!command.arguments || command.arguments.length === 0) {
            const mostSimilarCommand = this.findMostSimilarCommand(context, token);
            return err(new UnknownCommandError(token, command.fullName, mostSimilarCommand?.name));
          } else {
            return err(new UnknownArgumentError(command.fullName, token));
          }
        }
      }
    }
    // for required options or arguments, set default value if not set
    if (command.options) {
      for (const option of command.options) {
        if (option.required && option.value === undefined) {
          if (option.default !== undefined) {
            option.value = option.default;
            context.optionValues[this.optionInputKey(option)] = option.default;
            this.logger.debug(
              `set required option with default value, ${option.name}=${JSON.stringify(
                option.default
              )}`
            );
          }
        }
      }
    }
    if (command.arguments) {
      for (let i = 0; i < command.arguments.length; ++i) {
        const argument = command.arguments[i];
        if (argument.required && argument.value === undefined) {
          if (argument.default !== undefined) {
            argument.value = argument.default;
            context.argumentValues[i] = argument.default as string;
            this.logger.debug(
              `set required argument with default value, ${argument.name}=${JSON.stringify(
                argument.default
              )}`
            );
          }
        }
        // set argument value in optionValues
        if (argument.value !== undefined) {
          context.optionValues[this.optionInputKey(argument)] = argument.value;
        }
      }
    }
    return ok(undefined);
  }

  validateOptionsAndArguments(
    command: CLIFoundCommand
  ): Result<
    undefined,
    MissingRequiredOptionError | MissingRequiredArgumentError | InvalidChoiceError
  > {
    if (command.options) {
      for (const option of command.options) {
        const res = this.validateOption(command, option, "option");
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    if (command.arguments) {
      for (const argument of command.arguments) {
        const res = this.validateOption(command, argument, "argument");
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    return ok(undefined);
  }

  /**
   * validate option value
   */
  validateOption(
    command: CLIFoundCommand,
    option: CLICommandOption | CLICommandArgument,
    type: "option" | "argument"
  ): Result<undefined, MissingRequiredOptionError | MissingRequiredArgumentError> {
    if (option.required && option.default === undefined && option.value === undefined) {
      const error = new MissingRequiredOptionError(command.fullName, option.name);
      return err(error);
    }
    if (
      (option.type === "string" || option.type === "array") &&
      option.choices &&
      option.value !== undefined &&
      !option.skipValidation
    ) {
      if (option.type === "string") {
        if (!(option.choices as string[]).includes(option.value as string)) {
          return err(new InvalidChoiceError(command.fullName, option.name, option.value, option.choices));
        }
      } else {
        const values = option.value as string[];
        for (const v of values) {
          if (!(option.choices as string[]).includes(v)) {
            return err(new InvalidChoiceError(command.fullName, option.name, v, option.choices));
          }
        }
      }
    }
    return ok(undefined);
  }
}

