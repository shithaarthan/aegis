export function isBadState(apiBody) {
  // Non-crash failure detector (P4-T01): HTTP 200 with null cart marked loaded.
  return apiBody?.loaded === true && apiBody?.cart === null;
}
