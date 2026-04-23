import type { CAC } from "cac";
import { defineApplyCommand } from "./apply";
import { defineBumpCommand } from "./bump";
import { defineCatalogCommand } from "./catalog";
import { defineCleanCommand } from "./clean";
import { defineCheckSpellCommand } from "./cspell";
import { defineGraphCommand } from "./graph";
import { defineJfrogCommand } from "./jfrog";
import { defineSymlinkCommand } from "./link";
import { defineLintCommand } from "./lint";
import { defineMultiVersionCommand } from "./multi-version";
import { definePatchCommand } from "./patch";
import { definePushCommand } from "./push";
import { defineRunCommand } from "./run";
import { defineSpellCommand } from "./spell";
import { defineStaleCommand } from "./stale";
import { defineSyncpackCommand } from "./syncpack";
import { defineUpgradeCommand } from "./upgrade";

export function installCommands(cac: CAC) {
  defineRunCommand(cac)
  defineCatalogCommand(cac)
  defineCleanCommand(cac)
  defineBumpCommand(cac)
  definePushCommand(cac)
  defineUpgradeCommand(cac)
  defineCheckSpellCommand(cac)
  defineSpellCommand(cac)
  defineStaleCommand(cac)
  defineLintCommand(cac)
  defineSyncpackCommand(cac)
  defineMultiVersionCommand(cac)
  definePatchCommand(cac)
  defineApplyCommand(cac)
  defineSymlinkCommand(cac)
  defineGraphCommand(cac)
  defineJfrogCommand(cac)
}
