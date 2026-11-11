import { describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  deriveAccountAgeDaysFromRestId,
  evaluateTweet,
  evaluateAuthorProfile,
  processGraphqlResponsePayload,
  SlidingWindowTracker,
  type ExtractedAuthor,
  type ExtractedTweet,
} from '../src';

function makeMockAuthor(
  overrides: Partial<ExtractedAuthor> = {}
): ExtractedAuthor {
  return {
    restId: '10001',
    screenName: 'normal_user',
    name: 'Normal User',
    bio: 'Software Engineer building cool stuff',
    bioUrls: [],
    createdAt: '2021-01-01T00:00:00.000Z',
    accountAgeDays: 1000,
    statusesCount: 2000,
    dailyTweetRate: 2,
    followersCount: 1200,
    friendsCount: 300,
    followRatio: 0.25,
    mediaCount: 100,
    favouritesCount: 500,
    isBlueVerified: false,
    following: false,
    defaultProfileImage: false,
    ...overrides,
  };
}

function makeMockTweet(
  overrides: Partial<ExtractedTweet> = {},
  authorOverrides: Partial<ExtractedAuthor> = {}
): ExtractedTweet {
  return {
    tweetId: '999001',
    text: 'This is a normal high quality post about technology.',
    urls: [],
    hashtagCount: 1,
    cashtagCount: 0,
    isPromoted: false,
    isReply: false,
    replyCount: 5,
    favoriteCount: 25,
    viewCount: 1000,
    scene: 'timeline',
    author: makeMockAuthor(authorOverrides),
    ...overrides,
  };
}

describe('KeepXClean Rule Engine', () => {
  it('respects master and per-rule switches for profile badges', () => {
    const config = createDefaultConfig();
    const author = makeMockAuthor({ dailyTweetRate: 100 });
    expect(
      evaluateAuthorProfile(author, config).riskBadges.length
    ).toBeGreaterThan(0);
    config.rules.highFrequency.enabled = false;
    expect(evaluateAuthorProfile(author, config).riskBadges).toEqual([]);
    config.enabled = false;
    config.localBlocklistUids[author.restId] = {
      uid: author.restId,
      screenName: author.screenName,
      addedAt: 1,
    };
    expect(evaluateAuthorProfile(author, config).riskBadges).toEqual([]);
  });
  it('allows normal tweets', () => {
    const config = createDefaultConfig('standard');
    const tweet = makeMockTweet();
    const res = evaluateTweet(tweet, config);
    expect(res.blocked).toBe(false);
    expect(res.action).toBe('allow');
  });

  it('intercepts high-frequency daily posters', () => {
    const config = createDefaultConfig('standard'); // maxDailyTweets = 45
    const tweet = makeMockTweet(
      {},
      {
        statusesCount: 9500,
        accountAgeDays: 100,
        dailyTweetRate: 95,
      }
    );
    const res = evaluateTweet(tweet, config);
    expect(res.blocked).toBe(true);
    expect(res.ruleId).toBe('high_frequency_daily');
    expect(res.reasonText).toContain('历史日均 95 条');
    expect(res.evidence).toContainEqual({
      label: '日均上限',
      value: config.rules.highFrequency.maxDailyTweets,
    });
  });

  it('intercepts short-term sliding window spammers', () => {
    const config = createDefaultConfig('standard'); // slidingWindowMaxTweets = 8
    const tracker = new SlidingWindowTracker();
    for (let i = 1; i <= 9; i++) {
      const tweet = makeMockTweet(
        { tweetId: `t-${i}` },
        { restId: 'spammer-1' }
      );
      const res = evaluateTweet(tweet, config, null, tracker);
      if (i <= 8) {
        expect(res.blocked).toBe(false);
      } else {
        expect(res.blocked).toBe(true);
        expect(res.ruleId).toBe('high_frequency_window');
      }
    }
  });

  it('intercepts accounts exceeding crowd-sourced block count and protects high-follower accounts', () => {
    const config = createDefaultConfig('standard'); // minBlockCount = 3
    const snapshot = createDefaultCrowdSnapshot();
    snapshot.counts['bad-uid'] = { c: 4, t: 'nsfw' };
    snapshot.counts['big-v-uid'] = { c: 5, t: 'spam', p: true };

    const badTweet = makeMockTweet(
      {},
      { restId: 'bad-uid', followersCount: 200 }
    );
    const badRes = evaluateTweet(badTweet, config, snapshot);
    expect(badRes.blocked).toBe(true);
    expect(badRes.ruleId).toBe('crowd_block');
    expect(badRes.reasonText).toContain('社区快照记录 4 次');

    // High-follower account (>50k) requires 3 * 5 = 15 votes to prevent brigading
    const bigVTweet = makeMockTweet(
      {},
      { restId: 'big-v-uid', followersCount: 80_000 }
    );
    const bigVRes = evaluateTweet(bigVTweet, config, snapshot);
    expect(bigVRes.blocked).toBe(false);
  });

  it('intercepts multi-scope keywords and cloud anti-spam dictionary in bio/text', () => {
    const config = createDefaultConfig('standard');
    const nsfwBioTweet = makeMockTweet(
      { text: 'Good morning everyone!' },
      {
        bio: 'Check my secret page https://onlyfans.com/xyz',
        followersCount: 500,
      }
    );
    const res = evaluateTweet(nsfwBioTweet, config);
    expect(res.blocked).toBe(true);
    expect(res.ruleId).toBe('cloud_keyword');
  });

  it('intercepts blue-verified low-follower reply spammers in replies', () => {
    const config = createDefaultConfig('standard'); // maxFollowers = 500
    const replyTweet = makeMockTweet(
      { scene: 'reply', isReply: true, text: '@elonmusk Great point!' },
      { isBlueVerified: true, followersCount: 120 }
    );
    const res = evaluateTweet(replyTweet, config);
    expect(res.blocked).toBe(true);
    expect(res.ruleId).toBe('blue_reply_spam');
  });

  it('auto-exempts followed accounts and converts profile scene to badge_only', () => {
    const config = createDefaultConfig('standard');
    const followedHighFreq = makeMockTweet(
      {},
      { dailyTweetRate: 120, statusesCount: 12000, following: true }
    );
    expect(evaluateTweet(followedHighFreq, config).blocked).toBe(false);

    const profileHighFreq = makeMockTweet(
      { scene: 'profile' },
      { dailyTweetRate: 120, statusesCount: 12000, following: false }
    );
    const profileRes = evaluateTweet(profileHighFreq, config);
    expect(profileRes.blocked).toBe(false);
    expect(profileRes.action).toBe('badge_only');
    expect(profileRes.riskBadges.length).toBeGreaterThan(0);
  });

  it('strips blocked tweets directly from X GraphQL timeline payload in strip mode', () => {
    const config = createDefaultConfig('standard');
    const mockGraphqlPayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-good',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '111',
                            legacy: { full_text: 'Quality insight post' },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-good',
                                  legacy: {
                                    screen_name: 'good_dev',
                                    name: 'Good Dev',
                                    statuses_count: 200,
                                    followers_count: 3000,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    entryId: 'tweet-spam',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '222',
                            legacy: { full_text: 'Spam post #1' },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-spam',
                                  legacy: {
                                    screen_name: 'bot_999',
                                    name: 'Bot 999',
                                    statuses_count: 90000,
                                    followers_count: 50,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2026',
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const processed = processGraphqlResponsePayload(
      mockGraphqlPayload,
      'https://x.com/i/api/graphql/xxx/HomeTimeline',
      '/home',
      config
    );

    expect(processed.modified).toBe(true);
    expect(processed.interceptedLogs).toHaveLength(1);
    expect(processed.interceptedLogs[0].authorScreenName).toBe('bot_999');
    expect(
      mockGraphqlPayload.data.home.home_timeline_urt.instructions[0].entries
    ).toHaveLength(1);
    expect(
      mockGraphqlPayload.data.home.home_timeline_urt.instructions[0].entries[0]
        .entryId
    ).toBe('tweet-good');
  });

  it('extracts dailyTweetRate and filters tweets using X 2026 Relay schema (tweet_counts, relationship_counts, details.full_text)', () => {
    const config = createDefaultConfig('standard');
    const createdAtMs = Date.now() - 100 * 86_400_000; // 100 days ago
    const payload2026 = {
      data: {
        user_result_by_screen_name: {
          result: {
            __typename: 'User',
            rest_id: '44196397',
            core: {
              screen_name: 'spammer_2026',
              name: 'Spammer 2026',
              created_at_ms: createdAtMs,
            },
            tweet_counts: {
              tweets: 9500, // 95 tweets/day over 100 days
              media_tweets: 120,
            },
            relationship_counts: {
              followers: 80,
              following: 2000,
            },
            verification: {
              is_blue_verified: true,
            },
            legacy: {
              withheld_scope: '',
            },
            timeline_response: {
              timeline: {
                instructions: [
                  {
                    __typename: 'TimelineAddEntries',
                    entries: [
                      {
                        entryId: 'tweet-2026-1',
                        content: {
                          __typename: 'TimelineTimelineItem',
                          content: {
                            __typename: 'TimelineTweet',
                            tweet_results: {
                              result: {
                                __typename: 'Tweet',
                                rest_id: '2040000000000000001',
                                details: {
                                  full_text:
                                    'Posting 95 times a day with new 2026 schema!',
                                  hashtag_entities: [],
                                  cashtag_entities: [],
                                  url_entities: [],
                                },
                                counts: {
                                  reply_count: 1,
                                  favorite_count: 2,
                                },
                                core: {
                                  user_results: {
                                    result: {
                                      __typename: 'User',
                                      rest_id: '44196397',
                                      core: {
                                        screen_name: 'spammer_2026',
                                        name: 'Spammer 2026',
                                        created_at_ms: createdAtMs,
                                      },
                                      tweet_counts: {
                                        tweets: 9500,
                                      },
                                      relationship_counts: {
                                        followers: 80,
                                        following: 2000,
                                      },
                                      legacy: {
                                        withheld_scope: '',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };

    const processed = processGraphqlResponsePayload(
      payload2026,
      'https://api.x.com/graphql/xxx/UserWithProfileTweetsQueryV2',
      '/home',
      config
    );

    const authorRecord = processed.authorsByScreenName['spammer_2026'];
    expect(authorRecord).toBeDefined();
    expect(authorRecord.author.statusesCount).toBe(9500);
    expect(authorRecord.author.dailyTweetRate).toBeGreaterThan(90);
    expect(processed.modified).toBe(true);
    expect(processed.interceptedLogs).toHaveLength(1);
    expect(processed.interceptedLogs[0].ruleId).toBe('high_frequency_daily');
  });

  it('derives accurate account age from sequential and Snowflake X user IDs while rejecting invalid ranges', () => {
    const nowMs = Date.UTC(2026, 10, 11, 0, 0, 0);
    const epoch = 1288834974657n;

    // Pre-2010 and 2010–2016 sequential X user IDs
    expect(deriveAccountAgeDaysFromRestId('44196397', nowMs)).toBeGreaterThan(
      5000
    );
    expect(deriveAccountAgeDaysFromRestId('3000000000', nowMs)).toBeGreaterThan(
      3650
    );

    // 5-day-old Snowflake user ID (< 30 days anti-sybil threshold)
    const fiveDaysAgoMs = BigInt(nowMs - 5 * 86_400_000);
    const youngSnowflake = String((fiveDaysAgoMs - epoch) << 22n);
    const youngAge = deriveAccountAgeDaysFromRestId(youngSnowflake, nowMs);
    expect(youngAge).not.toBeNull();
    expect(youngAge!).toBeGreaterThan(4.9);
    expect(youngAge!).toBeLessThan(5.1);

    // 400-day-old Snowflake user ID
    const oldSnowflake = String(
      (BigInt(nowMs - 400 * 86_400_000) - epoch) << 22n
    );
    expect(deriveAccountAgeDaysFromRestId(oldSnowflake, nowMs)).toBeCloseTo(
      400,
      1
    );

    // Unrecognized gap / zero / future Snowflake IDs return null instead of fabricating 365 days
    const futureSnowflake = String(
      (BigInt(nowMs + 10 * 86_400_000) - epoch) << 22n
    );
    expect(deriveAccountAgeDaysFromRestId('0', nowMs)).toBeNull();
    expect(deriveAccountAgeDaysFromRestId('99999999999', nowMs)).toBeNull();
    expect(deriveAccountAgeDaysFromRestId(futureSnowflake, nowMs)).toBeNull();
  });
});
