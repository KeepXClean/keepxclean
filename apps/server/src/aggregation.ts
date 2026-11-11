/** Run with the report mutation in the same D1 batch transaction.
 * Recomputing from deduplicated reports keeps retries and reason edits exact.
 */
export function aggregateAccount(
  db: D1Database,
  uid: string,
  now: number,
  screenName: string | null = null,
  displayName: string | null = null,
  followers = 0
) {
  return db
    .prepare(
      `
    INSERT INTO account_reputation (
      target_uid, screen_name, display_name, followers_count, block_count,
      spam_count, nsfw_count, scam_count, ad_count, bot_count, dominant_tag, updated_at
    )
    SELECT ?, ?, ?, ?, COUNT(*),
      COALESCE(SUM(tag = 'spam'), 0), COALESCE(SUM(tag = 'nsfw'), 0),
      COALESCE(SUM(tag = 'scam'), 0), COALESCE(SUM(tag = 'ad'), 0), COALESCE(SUM(tag = 'bot'), 0),
      COALESCE((SELECT tag FROM block_reports WHERE target_uid = ? AND tag != 'other'
        GROUP BY tag ORDER BY COUNT(*) DESC, tag ASC LIMIT 1), 'other'), ?
    FROM block_reports WHERE target_uid = ?
    ON CONFLICT(target_uid) DO UPDATE SET
      screen_name = COALESCE(excluded.screen_name, account_reputation.screen_name),
      display_name = COALESCE(excluded.display_name, account_reputation.display_name),
      followers_count = MAX(account_reputation.followers_count, excluded.followers_count),
      block_count = excluded.block_count, spam_count = excluded.spam_count,
      nsfw_count = excluded.nsfw_count, scam_count = excluded.scam_count,
      ad_count = excluded.ad_count, bot_count = excluded.bot_count,
      dominant_tag = excluded.dominant_tag, updated_at = excluded.updated_at
  `
    )
    .bind(uid, screenName, displayName, followers, uid, now, uid);
}
