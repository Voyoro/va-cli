import type { CAC } from "cac";
import { defineApplyCommand } from "./apply";
import { defineBumpCommand } from "./bump";
import { defineCleanCommand } from "./clean";
import { defineGraphCommand } from "./graph";
import { defineSymlinkCommand } from "./link";
import { defineLintCommand } from "./lint";
import { definePatchCommand } from "./patch";
import { definePushCommand } from "./push";
import { defineRunCommand } from "./run";
import { defineSpellCommand } from "./spell";
import { defineUpgradeCommand } from "./upgrade";

export function installCommands(cac: CAC) {
  defineRunCommand(cac)
  defineCleanCommand(cac)
  defineBumpCommand(cac)
  definePushCommand(cac)
  defineUpgradeCommand(cac)
  defineSpellCommand(cac)
  defineLintCommand(cac)
  definePatchCommand(cac)
  defineApplyCommand(cac)
  defineSymlinkCommand(cac)
  defineGraphCommand(cac)
}
