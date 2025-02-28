import { ok } from "neverthrow";
import { CLICommand, CLIContext } from "../src/type";
import { CLIEngine } from "../src/engine";
import { DefaultHelper } from "../src/helper";
import { Console } from "console";
import { ConsoleLogger } from "../src/logger";

const helper = new DefaultHelper();
const logger = new ConsoleLogger();

function cmd1() {
  
  const cmd1: CLICommand = {
    name: "cmd1",
    fullName: "cmd1",
    description: "cmd1",
    execute: (ctx: CLIContext) => {
      console.log(ctx.optionValues);
      return ok(undefined);
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
    ],
  }


  const engine = new CLIEngine();
  engine.start(cmd1);
}


cmd1();