export const GTD_TASK_FILE_PATHS = {
  inbox: "tasks/inbox.md",
  focus: "tasks/focus.md",
  nextActions: "tasks/next-actions.md",
  waiting: "tasks/waiting.md",
  somedayMaybe: "tasks/someday-maybe.md",
} as const;

export type GtdTaskFilePath =
  (typeof GTD_TASK_FILE_PATHS)[keyof typeof GTD_TASK_FILE_PATHS];

export const GTD_TASK_FILES: readonly GtdTaskFilePath[] = [
  GTD_TASK_FILE_PATHS.inbox,
  GTD_TASK_FILE_PATHS.focus,
  GTD_TASK_FILE_PATHS.nextActions,
  GTD_TASK_FILE_PATHS.waiting,
  GTD_TASK_FILE_PATHS.somedayMaybe,
];

export const TASK_OCCURRENCE_TASK_FILES: readonly GtdTaskFilePath[] = [
  GTD_TASK_FILE_PATHS.inbox,
  GTD_TASK_FILE_PATHS.nextActions,
  GTD_TASK_FILE_PATHS.waiting,
  GTD_TASK_FILE_PATHS.somedayMaybe,
  GTD_TASK_FILE_PATHS.focus,
];
