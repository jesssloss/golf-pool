// Golf-flavored milestone copy
export const MILESTONE_COPY = {
  poolCreated: 'A tradition unlike any other.',
  invited: "You've been invited.",
  draftStarting: 'The field is set.',
  yourTurn: "You're on the clock.",
  draftComplete: 'The field is set. The fairways await.',
  dropWindow: 'The back nine awaits. Choose wisely.',
  poolFinalized: (poolName: string) => `A new champion at ${poolName}.`,
} as const

// Empty state copy
export const EMPTY_STATE_COPY = {
  preDraftNoPlayers: 'The clubhouse is quiet before dawn.',
  waitingFirstRound: 'The first group is on the tee.',
  midRoundUpdating: 'The leaders are on the back nine.',
  poolArchived: 'The tournament is over. See you next year.',
  draftBoardEmpty: 'The gallery is in their seats.',
} as const
