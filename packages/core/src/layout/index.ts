// Browser-safe entry (`@gtd/core/layout`): the vault layout rule without any
// Node dependency. Nothing in this folder may import from outside it;
// `tsconfig.layout.json` enforces Node-freedom.
export { dailyNoteDate, offsetDate, type IsoDate } from "./daily-note.js";
export {
  GTD_TASK_FILES,
  GTD_TASK_FILE_PATHS,
  TASK_OCCURRENCE_TASK_FILES,
  type GtdTaskFilePath,
} from "./gtd-task-files.js";
