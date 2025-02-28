import { ok } from "neverthrow";
import { CLICommand, CLIContext } from "../src/type";
import { CLIEngine } from "../src/engine";
import { DefaultHelper } from "../src/helper";
import { Console } from "console";
import { ConsoleLogger, Logger } from "../src/logger";

const helper = new DefaultHelper();

class MyLogger implements Logger {
  isDebug: boolean = true;
  info(message: string) {
    console.log(message);
  }
  error(message: string) {
    console.error(message);
  }
  warn(message: string) {
    console.warn(message);
  }
  debug(message: string) {
    if (this.isDebug)
      console.info(message);
  }
}

const logger = new MyLogger();

function cmd1() {
  
  const cmd1: CLICommand = {
    name: "cmd1",
    fullName: "cmd1",
    description: "cmd1",
    execute: (ctx: CLIContext) => {
      console.log(ctx.optionValues);
      return ok(undefined);
    },
    afterParseArgs: (ctx: CLIContext) => {
      console.log("afterParseArgs");
      if (!ctx.globalOptionValues.debug) {
        logger.isDebug = false;
      }
      return ok(true);
    },
    options: [
      {
        type: "boolean",
        name: "version",
        shortName: "v",
        description: "show version",
      },
      {
        type: "boolean",
        name: "help",
        shortName: "h",
        description: "show usage",
      },
      {
        type: "boolean",
        name: "debug",
        description: "debug mode",
        default: false,
      },
    ],
  }


  const engine = new CLIEngine(logger, helper);
  engine.start(cmd1);
}


cmd1();