

export class UnknownOptionError extends Error {
  constructor(command: string, option: string) {
    super(`Unknown option: ${option} for command :${command}`);
  }
}

export class UnknownArgumentError extends Error {
  constructor(command: string, argument: string) {
    super(`Unknown argument: ${argument} for command :${command}`);
  }
}


export class UnknownCommandError extends Error {
  constructor(token: string, fullName: string, mostSimilar?: string) {
    super(`'${token}' is misspelled or not recognized by Teams Toolkit CLI.${
        mostSimilar ? " Did you mean '" + fullName + " " + mostSimilar + "'?" : ""
      } Use '${fullName} -h' for more command information.`);
  }
}

export class MissingRequiredOptionError extends Error {
  constructor(command: string, option: string) {
    super(`Command ${command} missing required option: ${option}`);
  }
}

export class MissingRequiredArgumentError extends Error {
  constructor(command: string, argument: string) {
    super(`Command ${command} missing required argument: ${argument}`);
  }
}

export class InvalidChoiceError extends Error {
  constructor(command: string, name: string, currentChoice: string, choices: string[]) {
    super(`"Command ${command} has invalid choice '${currentChoice}' for option/argument '${name}', allowed values: ${choices.join(", ")}`);
  }
}