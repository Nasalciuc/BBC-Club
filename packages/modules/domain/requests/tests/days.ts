/**
 * Request days a test can send whatever day it runs: the 12th and the 19th of the month after next, in UTC. submit()
 * refuses a leg on a day already over everywhere (SubmittedRequestBody), so a fixed date breaks the suite once it
 * passes.
 */
const month = new Date();
month.setUTCDate(1);
month.setUTCMonth(month.getUTCMonth() + 2);
const ym = month.toISOString().slice(0, 7);

export const DEPART = `${ym}-12`;
export const RETURN = `${ym}-19`;
