// Masters-flavored milestone copy
export const MILESTONE_COPY = {
  poolCreated: 'A tradition unlike any other.',
  invited: "You've been invited.",
  draftStarting: 'The field is set.',
  yourTurn: "You're on the clock.",
  draftComplete: 'The field is set. Magnolia Lane awaits.',
  dropWindow: 'Amen Corner awaits. Choose wisely.',
  poolFinalized: (poolName: string) => `A new champion at ${poolName}.`,
} as const

// Empty state copy
export const EMPTY_STATE_COPY = {
  preDraftNoPlayers: 'Augusta is quiet before dawn.',
  waitingFirstRound: 'The first group is on the tee.',
  midRoundUpdating: 'The leaders are on the back nine.',
  poolArchived: 'The azaleas have bloomed. See you next April.',
  draftBoardEmpty: 'The patrons are in their seats.',
} as const
