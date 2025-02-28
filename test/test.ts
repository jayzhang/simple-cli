import { ok } from "neverthrow";
import { CLICommand, CLIContext } from "../src/type";
import { CLIEngine } from "../src/engine";



function cmd1() {
  const cmd1: CLICommand = {
    name: "cmd1",
    description: "cmd1",
    options: [
      {
        name: "option1",
        type: "array",
        description: "option1",
        choices: ["a", "b", "c"],
        required: true
      },
    ],
    execute: (ctx: CLIContext) => {
      console.log(ctx.optionValues);
      return ok(true);
    }
  }

  const engine = new CLIEngine();
  engine.start(cmd1);
}


cmd1();