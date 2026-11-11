import { describe, expect, it } from 'vitest';
import {
  applyPresetToConfig,
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  DEFAULT_CLOUD_KEYWORDS,
  deriveAccountAgeDaysFromRestId,
  detectSceneFromUrl,
  evaluateTweet,
  evaluateAuthorProfile,
  getBlockReasonLabels,
  getCloudKeywordNote,
  getTweetLanguageLabel,
  mergeCloudKeywords,
  processGraphqlResponsePayload,
  resolveLocale,
  SlidingWindowTracker,
  SUPPORTED_LOCALES,
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
    expect(res.reasonText).toContain('High frequency: 95 posts/day');
    expect(res.evidence).toContainEqual({
      label: 'Daily limit',
      value: config.rules.highFrequency.maxDailyTweets,
    });

    config.locale = 'zh-CN';
    const zhRes = evaluateTweet(tweet, config);
    expect(zhRes.reasonText).toContain('历史日均 95 条');
    expect(zhRes.evidence).toContainEqual({
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
    expect(badRes.reasonText).toContain('Community reports: 4');
    expect(
      evaluateAuthorProfile(badTweet.author, config, snapshot).hasCrowdBadge
    ).toBe(true);

    // High-follower account (>50k) requires 3 * 5 = 15 votes to prevent brigading
    const bigVTweet = makeMockTweet(
      {},
      { restId: 'big-v-uid', followersCount: 80_000 }
    );
    const bigVRes = evaluateTweet(bigVTweet, config, snapshot);
    expect(bigVRes.blocked).toBe(false);
  });

  it('intercepts multi-scope keywords and cloud anti-spam dictionary in bio/text while respecting disabledCloudKeywordIds', () => {
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

    // Disabling that single cloud rule skips it while keeping other cloud rules active
    config.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    expect(evaluateTweet(nsfwBioTweet, config).blocked).toBe(false);

    const gamblingTweet = makeMockTweet(
      { text: '最新官方哈希竞猜，注册送彩金秒提现' },
      { followersCount: 300 }
    );
    expect(evaluateTweet(gamblingTweet, config).ruleId).toBe('cloud_keyword');
  });

  it('covers cliché, ragebait, clickbait, AI-slop, and scam public keyword packs without false positives', () => {
    const config = createDefaultConfig('standard');

    // Every built-in cloud keyword must have a unique ID, compile cleanly, and default to no follower exemption
    const ids = DEFAULT_CLOUD_KEYWORDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of DEFAULT_CLOUD_KEYWORDS) {
      expect(() => new RegExp(item.pattern, 'i')).not.toThrow();
      expect(item.maxFollowersExempt).toBeUndefined();
    }

    // High-follower unfollowed marketing accounts (e.g. 500k followers) are still intercepted by default
    expect(
      evaluateTweet(
        makeMockTweet(
          { text: '冷知识：章鱼其实有三颗心脏。' },
          { followersCount: 500_000 }
        ),
        config
      ).ruleId
    ).toBe('cloud_keyword');

    const clicheSamples = [
      '冷知识：章鱼其实有三颗心脏，很多人不知道。',
      '分享一个热知识，其实你每天都在被算法喂养。',
      '说句暴论：90% 的所谓独立开发根本不需要微服务。',
      '说句得罪人的话，现在的互联网已经没有活人了。',
      '99%的人都不知道的隐藏功能，看完沉默了！',
      '刚刚突发：某巨头宣布彻底重组！',
      'BREAKING: 🚨 Major announcement coming in 24 hours!',
      '普通人如何翻身？本质上就是靠信息差完成认知变现。',
      '熬夜整理了 15 个神级 AI 工具，保姆级喂饭教程，强烈建议收藏！',
      '家人们谁懂啊，今天一整个无语住了。',
      'Unpopular opinion: most AI wrappers will disappear this year.',
      '10 websites that feel illegal to know:',
      '最新纸飞机 Telegram 中文汉化包点击安装',
      '币安最高返佣 40%，填邀请码立减手续费',
      '承接全国 USDT 跑分车队，推特老号批发',
      '大饼跌破 9 万刀，多空双爆，狗庄又在洗盘了！',
      '今天冲土狗翻倍了，CA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      '按头撸！融资两千万的零撸项目空投交互教程，注意防女巫',
      '新号起航，求互关，看到必回关，蓝V互助一起做数据！',
      'Let us grow together! Follow for follow, 100% follow back #F4F',
      '初心者ですがよろしくお願いします！相互フォロー フォロバ100',
    ];

    for (const sample of clicheSamples) {
      const res = evaluateTweet(
        makeMockTweet({ text: sample }, { followersCount: 15_000 }),
        config
      );
      expect(res.blocked, `Expected to block: ${sample}`).toBe(true);
      expect(res.ruleId).toBe('cloud_keyword');
      expect(res.reasonText).toContain('matched public pack');
    }

    // Mutual-follow tags in author display name / bio are also caught
    expect(
      evaluateTweet(
        makeMockTweet({ text: '早上好！' }, { name: '阿杰（互关必回）' }),
        config
      ).ruleId
    ).toBe('cloud_keyword');

    // Normal technical, news, food, pet, and daily posts must NOT be false-positived
    const cleanSamples = [
      '今天突发奇想用 Rust 重写了一个命令行解析器，体积小了一半。',
      '这个分布式存储引擎的底层逻辑设计得非常克制。',
      '整理了一份团队内部的 TypeScript 代码规范备忘录。',
      'Hot weather today in Tokyo, finally feels like summer.',
      'Telegram Desktop 5.8 just shipped native passkey support.',
      '周末在家撸毛孩子太治愈了，小猫一直呼噜呼噜。',
      '早上买了个正宗山东大饼夹鸡蛋，真香！',
      '这两个模块之间存在强交互关系，朋友之间也要相互关心。',
      'I will follow back up with the engineering team tomorrow morning.',
    ];
    for (const clean of cleanSamples) {
      const res = evaluateTweet(
        makeMockTweet({ text: clean }, { followersCount: 1_500 }),
        config
      );
      expect(res.blocked, `Expected to allow: ${clean}`).toBe(false);
    }

    // Reply-only AI leak / bio funnel rule triggers on third-party replies, NOT on timeline or focal thread OP self-replies
    expect(
      evaluateTweet(
        makeMockTweet(
          { scene: 'timeline', isReply: false, text: '详情请看我主页置顶' },
          { followersCount: 800 }
        ),
        config
      ).blocked
    ).toBe(false);

    expect(
      evaluateTweet(
        makeMockTweet(
          {
            scene: 'reply',
            isReply: true,
            text: '@op 看我主页置顶有完整分析',
            focalAuthor: {
              restId: 'u-op',
              screenName: 'op_user',
              name: 'OP',
              followersCount: 20_000,
            },
          },
          { restId: 'u-op', followersCount: 800 }
        ),
        config
      ).blocked
    ).toBe(false);

    expect(
      evaluateTweet(
        makeMockTweet(
          {
            scene: 'reply',
            isReply: true,
            text: '@op 看我主页置顶有好东西',
            focalAuthor: {
              restId: 'u-op',
              screenName: 'op_user',
              name: 'OP',
              followersCount: 20_000,
            },
          },
          { restId: 'u-stranger', followersCount: 800 }
        ),
        config
      ).ruleId
    ).toBe('cloud_keyword');

    // Stale remote snapshot with only 1 older item still merges all built-in packs + respects remote pause & hotfixes
    const merged = mergeCloudKeywords([
      {
        ...DEFAULT_CLOUD_KEYWORDS[0]!,
        enabled: false,
      },
      {
        id: 'cloud-hotfix-remote-1',
        pattern: 'remote-hotfix-scam',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
        note: '云端热更新测试规则',
      },
    ]);
    expect(merged.length).toBe(DEFAULT_CLOUD_KEYWORDS.length + 1);
    expect(merged[0]!.enabled).toBe(false);
    expect(merged.at(-1)!.id).toBe('cloud-hotfix-remote-1');
  });

  it('allows thoughtful replies from low-follower Blue-verified users while catching behavior-based reply spam', () => {
    const config = createDefaultConfig('standard');

    // Regression: thoughtful Chinese comment by a 676-follower Blue user must NOT be false-positived
    const thoughtfulBlueReply = makeMockTweet(
      {
        scene: 'reply',
        isReply: true,
        text: '@author 好像微信小程序不需要？。上谷歌商店是更方便一点。国内好像不支持ai写的。',
      },
      { isBlueVerified: true, followersCount: 676 }
    );
    expect(evaluateTweet(thoughtfulBlueReply, config).blocked).toBe(false);

    // 4-CJK-character substantive reply (weight = 8 >= 6) passes
    const conciseValidReply = makeMockTweet(
      { scene: 'reply', isReply: true, text: '@author 分析很透彻' },
      { isBlueVerified: true, followersCount: 120 }
    );
    expect(evaluateTweet(conciseValidReply, config).blocked).toBe(false);

    // Boilerplate / pure emoji / ultra-short water replies are caught
    for (const spamText of ['@elonmusk 🔥🔥💯', '@elonmusk This!', '@a 顶']) {
      const res = evaluateTweet(
        makeMockTweet(
          { scene: 'reply', isReply: true, text: spamText },
          { isBlueVerified: true, followersCount: 120 }
        ),
        config
      );
      expect(res.blocked).toBe(true);
      expect(res.ruleId).toBe('reply_spam');
    }

    // Bio funnel link spam (linktr.ee / t.me) in replies is caught, while github.com is allowed
    const funnelBioReply = makeMockTweet(
      {
        scene: 'reply',
        isReply: true,
        text: '@author Totally agree with your perspective on the market today!',
      },
      {
        followersCount: 300,
        bioUrls: ['https://linktr.ee/crypto_girl'],
      }
    );
    expect(evaluateTweet(funnelBioReply, config).ruleId).toBe('reply_spam');

    const githubBioReply = makeMockTweet(
      {
        scene: 'reply',
        isReply: true,
        text: '@author Totally agree with your perspective on the market today!',
      },
      {
        followersCount: 300,
        bioUrls: ['https://github.com/oss-author'],
      }
    );
    expect(evaluateTweet(githubBioReply, config).blocked).toBe(false);

    // Media-only reply with trailing t.co link is NOT misclassified as emoji in standard, and IS caught in strict
    const mediaOnlyReply = makeMockTweet(
      {
        scene: 'reply',
        isReply: true,
        text: '@author https://t.co/pic12345',
        hasMedia: true,
        urls: [],
      },
      { followersCount: 400 }
    );
    expect(evaluateTweet(mediaOnlyReply, config).blocked).toBe(false);
    const strictConfig = createDefaultConfig('strict');
    expect(evaluateTweet(mediaOnlyReply, strictConfig).ruleId).toBe(
      'reply_spam'
    );
  });

  it('protects focal thread author multi-tweet threads and detects lookalike impersonators in TweetDetail', () => {
    const config = createDefaultConfig('standard');
    const tracker = new SlidingWindowTracker();

    const makeDetailItem = (
      entryId: string,
      tweetId: string,
      userId: string,
      screenName: string,
      name: string,
      followersCount: number,
      fullText: string
    ) => ({
      entryId,
      content: {
        itemContent: {
          tweet_results: {
            result: {
              rest_id: tweetId,
              legacy: {
                full_text: fullText,
                in_reply_to_status_id_str:
                  tweetId === '5000' ? undefined : '5000',
              },
              core: {
                user_results: {
                  result: {
                    rest_id: userId,
                    legacy: {
                      screen_name: screenName,
                      name,
                      statuses_count: 500,
                      followers_count: followersCount,
                      created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Focal author posts 10 thread items (including short "1/") + 1 impersonator reply
    const entries = [
      makeDetailItem(
        'focal',
        '5000',
        'u-focal',
        'VitalikButerin',
        'Vitalik Buterin',
        5_000_000,
        'Main thread head'
      ),
      ...Array.from({ length: 10 }, (_, idx) =>
        makeDetailItem(
          `thread-${idx + 1}`,
          `500${idx + 1}`,
          'u-focal',
          'VitalikButerin',
          'Vitalik Buterin',
          5_000_000,
          `${idx + 1}/`
        )
      ),
      makeDetailItem(
        'impersonator-1',
        '5999',
        'u-scam',
        'VitalikButer1n',
        'Vitalik Buterin',
        45,
        'Thanks for reading! Check our community reward announcement.'
      ),
    ];

    const payload = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [{ type: 'TimelineAddEntries', entries }],
        },
      },
    };

    const res = processGraphqlResponsePayload(
      payload,
      'https://x.com/i/api/graphql/xxx/TweetDetail',
      '/VitalikButerin/status/5000',
      config,
      null,
      tracker
    );

    // Only the impersonator is stripped; all 10 focal author thread items survive intact
    expect(res.interceptedLogs).toHaveLength(1);
    expect(res.interceptedLogs[0].ruleId).toBe('impersonation');
    expect(res.interceptedLogs[0].authorScreenName).toBe('VitalikButer1n');
    expect(
      payload.data.threaded_conversation_with_injections_v2.instructions[0]
        .entries
    ).toHaveLength(11);
  });

  it('intercepts engagement bait and language filter rules while exempting non-linguistic tweets', () => {
    const config = createDefaultConfig('standard');

    const dmBait = makeMockTweet({
      text: 'I built an autonomous agent workflow. Comment "AGENT" and I\'ll DM you the full repo!',
    });
    expect(evaluateTweet(dmBait, config).ruleId).toBe('engagement_bait');

    const cnBait = makeMockTweet({
      text: '整理了一份 2026 独立开发出海手册，评论区扣 666 免费发你！',
    });
    expect(evaluateTweet(cnBait, config).ruleId).toBe('engagement_bait');

    const followBait = makeMockTweet({
      text: '蓝标互关，有粉必回，诚信互关互赞！',
    });
    expect(evaluateTweet(followBait, config).ruleId).toBe('engagement_bait');

    // Language filter: allow only zh & en
    config.rules.languageFilter = {
      enabled: true,
      mode: 'allow',
      languages: ['zh', 'en'],
    };
    expect(
      evaluateTweet(makeMockTweet({ lang: 'tr', text: 'Merhaba dünya' }), config)
        .ruleId
    ).toBe('language_filter');
    expect(
      evaluateTweet(makeMockTweet({ lang: 'zh', text: '你好世界' }), config)
        .blocked
    ).toBe(false);
    // Media/link-only non-linguistic lang codes ('qme', 'und') are never blocked by languageFilter
    expect(
      evaluateTweet(makeMockTweet({ lang: 'qme', text: '' }), config).blocked
    ).toBe(false);

    // Preset switch preserves languageFilter
    const switched = applyPresetToConfig(config, 'strict');
    expect(switched.rules.languageFilter).toEqual(config.rules.languageFilter);
  });

  it('always strips promoted ads even in collapse mode, and enforces custom keywords & secondary author penetration on followed accounts', () => {
    const config = createDefaultConfig('standard');
    config.interceptionMode = 'collapse';
    config.rules.keywords.items.push({
      id: 'kw-spoiler',
      pattern: '剧透预警',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    config.rules.keywords.items.push({
      id: 'kw-reply-only',
      pattern: '求私信',
      isRegex: false,
      scopes: ['text'],
      onlyInReplies: true,
      enabled: true,
    });

    // 1. Promoted ad ALWAYS returns strip even when interceptionMode === 'collapse'
    const adRes = evaluateTweet(makeMockTweet({ isPromoted: true }), config);
    expect(adRes.blocked).toBe(true);
    expect(adRes.ruleId).toBe('promoted_ad');
    expect(adRes.action).toBe('strip');

    // 2. Followed author is still filtered by user's explicit custom keyword
    const followedSpoiler = makeMockTweet(
      { text: '今晚大结局剧透预警！' },
      { following: true }
    );
    expect(evaluateTweet(followedSpoiler, config).ruleId).toBe('keyword');

    // 3. onlyInReplies keyword ignores timeline posts but catches replies
    expect(
      evaluateTweet(
        makeMockTweet({ scene: 'timeline', isReply: false, text: '求私信链接' }),
        config
      ).blocked
    ).toBe(false);
    expect(
      evaluateTweet(
        makeMockTweet({ scene: 'reply', isReply: true, text: '求私信链接' }),
        config
      ).ruleId
    ).toBe('keyword');

    // 4. Followed friend quoting an unfollowed crowd-blocked scammer is caught with scammer's UID in evidence
    const snapshot = createDefaultCrowdSnapshot();
    snapshot.counts['scammer-99'] = { c: 6, t: 'scam' };
    const followedQuotingScammer = makeMockTweet(
      {
        text: '大家小心这个骗子',
        quotedAuthor: makeMockAuthor({
          restId: 'scammer-99',
          screenName: 'scam_airdrop',
          followersCount: 300,
          following: false,
        }),
      },
      { restId: 'friend-1', screenName: 'my_friend', following: true }
    );
    const quoteRes = evaluateTweet(followedQuotingScammer, config, snapshot);
    expect(quoteRes.blocked).toBe(true);
    expect(quoteRes.ruleId).toBe('crowd_block');
    expect(quoteRes.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'scammer-99',
    });
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

  it('resolves browser locales and localizes rule reasons, badges, labels, and cloud notes across all 10 languages', () => {
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveLocale('auto', 'zh-Hans-SG')).toBe('zh-CN');
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh-TW');
    expect(resolveLocale('auto', 'zh-HK')).toBe('zh-TW');
    expect(resolveLocale('auto', 'zh-Hant-MO')).toBe('zh-TW');
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja');
    expect(resolveLocale('auto', 'ko-KR')).toBe('ko');
    expect(resolveLocale('auto', 'es-MX')).toBe('es');
    expect(resolveLocale('auto', 'pt-BR')).toBe('pt');
    expect(resolveLocale('auto', 'pt-PT')).toBe('pt');
    expect(resolveLocale('auto', 'fr-CA')).toBe('fr');
    expect(resolveLocale('auto', 'de-AT')).toBe('de');
    expect(resolveLocale('auto', 'ru-RU')).toBe('ru');
    expect(resolveLocale('auto', 'it-IT')).toBe('en');
    expect(resolveLocale('ja', 'zh-CN')).toBe('ja');

    const snapshot = createDefaultCrowdSnapshot();
    snapshot.counts['crowd-1'] = { c: 5, t: 'scam' };

    for (const loc of SUPPORTED_LOCALES) {
      const config = createDefaultConfig('standard');
      config.locale = loc;

      const reasonLabels = getBlockReasonLabels(loc);
      expect(Object.keys(reasonLabels)).toHaveLength(6);
      for (const v of Object.values(reasonLabels)) {
        expect(v.trim().length).toBeGreaterThan(0);
      }
      expect(getTweetLanguageLabel('zh', loc).trim().length).toBeGreaterThan(0);

      for (const kw of DEFAULT_CLOUD_KEYWORDS) {
        const note = getCloudKeywordNote(kw, loc);
        expect(
          note.trim().length,
          `Missing note for ${kw.id} in ${loc}`
        ).toBeGreaterThan(0);
      }

      const crowdTweet = makeMockTweet(
        {},
        { restId: 'crowd-1', followersCount: 100 }
      );
      const decision = evaluateTweet(crowdTweet, config, snapshot);
      expect(decision.blocked).toBe(true);
      expect(decision.reasonText?.trim().length).toBeGreaterThan(0);

      const profileEval = evaluateAuthorProfile(
        crowdTweet.author,
        config,
        snapshot
      );
      expect(profileEval.hasCrowdBadge).toBe(true);
      expect(profileEval.riskBadges.length).toBeGreaterThan(0);
    }
  });

  it('attributes secondary author UIDs accurately across locales and per-author follower exemptions', () => {
    const config = createDefaultConfig('standard');
    config.locale = 'en';
    config.rules.keywords.items.push({
      id: 'kw-bio-promo',
      pattern: 'vip-promo-group',
      isRegex: false,
      scopes: ['bio'],
      maxFollowersExempt: 10000,
      enabled: true,
    });

    // 1a. Primary author has 80k followers (above maxFollowersExempt: 10000), retweetedAuthor is clean,
    // quotedAuthor has 150 followers and matching bio -> must block AND hit_uid must point to quotedAuthor (not retweetedAuthor)
    const multiHopTweet = makeMockTweet(
      {
        text: 'RT @clean_curator: check this out',
        retweetedAuthor: makeMockAuthor({
          restId: 'u-clean-rt',
          screenName: 'clean_curator',
          name: 'Clean Curator',
          bio: 'Tech curator',
          followersCount: 5000,
          following: false,
        }),
        quotedAuthor: makeMockAuthor({
          restId: 'u-quoted-spam',
          screenName: 'promo_bot_99',
          name: 'Promo Bot',
          bio: 'Join vip-promo-group today',
          followersCount: 150,
          following: false,
        }),
      },
      {
        restId: 'u-friend',
        screenName: 'my_friend',
        followersCount: 80000,
        following: true,
      }
    );

    const multiHopRes = evaluateTweet(multiHopTweet, config);
    expect(multiHopRes.blocked).toBe(true);
    expect(multiHopRes.ruleId).toBe('keyword');
    expect(multiHopRes.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'u-quoted-spam',
    });

    // 1b. Conversely, if quotedAuthor has 50k followers (above maxFollowersExempt: 10000) and primary has 50 followers (clean bio), allow!
    const highFollowerQuoted = makeMockTweet(
      {
        text: 'Discussing creator communities',
        quotedAuthor: makeMockAuthor({
          restId: 'u-big-creator',
          screenName: 'big_creator',
          bio: 'Official founder of vip-promo-group',
          followersCount: 50000,
          following: false,
        }),
      },
      {
        restId: 'u-small-reader',
        screenName: 'small_reader',
        bio: 'Just reading news',
        followersCount: 50,
        following: false,
      }
    );
    expect(evaluateTweet(highFollowerQuoted, config).blocked).toBe(false);

    // 2. GraphQL payload log attribution in non-Chinese locale ('ja') must credit quotedAuthor, not followed friend
    config.locale = 'ja';
    const snapshot = createDefaultCrowdSnapshot();
    snapshot.counts['u-scammer-jp'] = { c: 8, t: 'scam' };

    const graphqlQuotePayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-friend-quote-1',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '9001',
                            legacy: { full_text: '注意喚起です' },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-friend-jp',
                                  legacy: {
                                    screen_name: 'friend_jp',
                                    name: 'Friend JP',
                                    following: true,
                                    statuses_count: 300,
                                    followers_count: 1200,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
                            },
                            quoted_status_result: {
                              result: {
                                rest_id: '9002',
                                legacy: { full_text: 'Free airdrop scam' },
                                core: {
                                  user_results: {
                                    result: {
                                      rest_id: 'u-scammer-jp',
                                      legacy: {
                                        screen_name: 'scammer_jp',
                                        name: 'Scammer JP',
                                        following: false,
                                        statuses_count: 50,
                                        followers_count: 20,
                                        created_at:
                                          'Wed Jan 01 00:00:00 +0000 2025',
                                      },
                                    },
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
      graphqlQuotePayload,
      'https://x.com/i/api/graphql/xxx/HomeTimeline',
      '/home',
      config,
      snapshot
    );
    expect(processed.modified).toBe(true);
    expect(processed.interceptedLogs).toHaveLength(1);
    expect(processed.interceptedLogs[0].authorUid).toBe('u-scammer-jp');
    expect(processed.interceptedLogs[0].authorScreenName).toBe('scammer_jp');
  });

  it('detects profile, reply, search, and timeline scenes accurately across GraphQL and SSR URLs', () => {
    expect(
      detectSceneFromUrl('https://x.com/i/api/graphql/1/TweetDetail', '/home')
    ).toBe('reply');
    expect(detectSceneFromUrl('SSR_RELAY', '/elonmusk/status/12345')).toBe(
      'reply'
    );
    expect(
      detectSceneFromUrl(
        'https://x.com/i/api/graphql/1/SearchTimeline',
        '/explore'
      )
    ).toBe('search');
    expect(detectSceneFromUrl('SSR_RELAY', '/elonmusk')).toBe('profile');
    expect(detectSceneFromUrl('SSR_RELAY', '/elonmusk/likes')).toBe('profile');
    expect(detectSceneFromUrl('SSR_RELAY', '/home')).toBe('timeline');
    expect(detectSceneFromUrl('SSR_RELAY', '/notifications')).toBe('timeline');
    expect(
      detectSceneFromUrl('https://x.com/i/api/graphql/1/UserTweets', '/home')
    ).toBe('profile');
  });
});
