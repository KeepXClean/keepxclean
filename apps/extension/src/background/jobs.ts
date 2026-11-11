import {
  STORAGE_KEYS,
  type AccountListEntry,
  type ViewerProfile,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import {
  digest,
  errorText,
  isNotFoundError,
  isUnconfirmedError,
  notFoundError,
  UI_KEYS,
  unconfirmedError,
  type ImportJob,
  type NativeResult,
  type Operation,
  type ResolvedAccount,
} from '../services/model';
import {
  assert,
  parseAccountQuery,
  UID,
  validateAccount,
} from '../services/validation';
import { enqueue, readConfig, readState } from './repository';
import { post } from './remote';

export async function native(
  tabId: number | undefined,
  action: string,
  params: Record<string, unknown> = {}
): Promise<NativeResult> {
  const e = getActiveErrors();
  assert(tabId !== undefined, e.missingXTab);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'KXC_NATIVE_BRIDGE',
        action,
        ...params,
      }) as Promise<NativeResult>,
      new Promise<NativeResult>((_, reject) => {
        timer = setTimeout(
          () => reject(unconfirmedError(e.xRequestTimeout)),
          25000
        );
      }),
    ]);
  } catch (error) {
    const msg = e.xConnectionFailed(errorText(error));
    throw isUnconfirmedError(error) ? unconfirmedError(msg) : new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}
async function viewerFor(
  tabId: number | undefined,
  expected?: string
): Promise<ViewerProfile> {
  const e = getActiveErrors();
  const result = await native(tabId, 'GET_VIEWER');
  assert(
    result.ok &&
      result.viewerUid &&
      (!expected || expected === result.viewerUid),
    e.xAccountSwitchedOrLoggedOut
  );
  const data = await chrome.storage.local.get(UI_KEYS.viewers);
  const viewer: ViewerProfile | undefined =
    data[UI_KEYS.viewers]?.[String(tabId)];
  assert(
    viewer && viewer.restId === result.viewerUid && viewer.accountAgeDays > 0,
    e.viewerProfileMissing
  );
  return viewer;
}
async function getOperations(): Promise<Operation[]> {
  return (
    (await chrome.storage.local.get(UI_KEYS.operations))[UI_KEYS.operations] ??
    []
  );
}
async function getImports(): Promise<ImportJob[]> {
  return (
    (await chrome.storage.local.get(UI_KEYS.imports))[UI_KEYS.imports] ?? []
  );
}
async function updateOperation(id: string, update: (op: Operation) => void) {
  return enqueue(async () => {
    const list = await getOperations();
    const op = list.find((x) => x.id === id);
    assert(op, getActiveErrors().operationNotFound);
    update(op);
    await chrome.storage.local.set({ [UI_KEYS.operations]: list });
    return op;
  });
}
async function updateImport(id: string, update: (job: ImportJob) => void) {
  return enqueue(async () => {
    const list = await getImports();
    const job = list.find((x) => x.id === id);
    assert(job, getActiveErrors().importJobNotFound);
    update(job);
    await chrome.storage.local.set({ [UI_KEYS.imports]: list });
    return job;
  });
}
export async function startBlock(
  entryInput: AccountListEntry,
  tabId: number | undefined,
  followers?: number,
  nativeAlreadyDone = false
) {
  const entry = validateAccount(entryInput);
  const op = await enqueue(async () => {
    const config = await readConfig(),
      list = await getOperations();
    const active = list.find(
      (x) =>
        x.entry.uid === entry.uid &&
        x.tabId === tabId &&
        !x.cancelled &&
        (x.nativeX === 'pending' ||
          x.nativeX === 'running' ||
          x.community === 'pending' ||
          x.community === 'running' ||
          x.undoUntil > Date.now())
    );
    if (active) return active;
    const viewer = (await chrome.storage.local.get(UI_KEYS.viewers))[
      UI_KEYS.viewers
    ]?.[String(tabId)] as ViewerProfile | undefined;
    const operation: Operation = {
      id: crypto.randomUUID(),
      entry,
      tabId,
      viewerUid: viewer?.restId,
      followers,
      createdAt: Date.now(),
      undoUntil: nativeAlreadyDone ? 0 : Date.now() + 4500,
      local: 'succeeded',
      nativeX: nativeAlreadyDone
        ? 'succeeded'
        : config.syncNativeXBlock
          ? 'pending'
          : 'not_requested',
      community: config.enableCrowdReport ? 'pending' : 'not_requested',
      errors: {},
      previousBlack: config.localBlocklistUids[entry.uid],
      previousWhite: config.whitelistUids[entry.uid],
      savedEntry: entry,
    };
    delete config.whitelistUids[entry.uid];
    config.localBlocklistUids[entry.uid] = entry;
    let completed = 0;
    const retained = list.filter((x) => {
      if (
        x.undoUntil > Date.now() ||
        [x.nativeX, x.community].some(
          (stage) => stage === 'pending' || stage === 'running'
        )
      )
        return true;
      return x.createdAt > Date.now() - 7 * 86400000 && completed++ < 99;
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config,
      [UI_KEYS.operations]: [operation, ...retained],
    });
    return operation;
  });
  schedule(op);
  return op.id;
}
function schedule(op: Operation) {
  const when = Math.max(Date.now() + 20, op.undoUntil);
  void chrome.alarms.create(`kxc-op-${op.id}`, { when });
  setTimeout(
    () => {
      void runOperation(op.id);
    },
    Math.max(0, when - Date.now())
  );
}
const running = new Set<string>();
export async function runOperation(id: string, only?: 'nativeX' | 'community') {
  if (running.has(id)) return;
  running.add(id);
  try {
    for (const stage of (only ? [only] : ['nativeX', 'community']) as (
      | 'nativeX'
      | 'community'
    )[]) {
      const op = (await getOperations()).find((x) => x.id === id);
      if (!op || op.cancelled || op.undoUntil > Date.now()) continue;
      if (op[stage] !== 'pending') continue;
      await updateOperation(id, (x) => {
        x[stage] = 'running';
        delete x.errors[stage];
      });
      try {
        const config = await readConfig();
        const e = getErrors(config.locale);
        if (
          !(stage === 'nativeX'
            ? config.syncNativeXBlock
            : config.enableCrowdReport)
        ) {
          await updateOperation(id, (x) => {
            x[stage] = 'not_requested';
          });
          continue;
        }
        if (stage === 'nativeX') {
          if (!op.viewerUid) throw unconfirmedError(e.viewerUnconfirmed);
          const result = await native(op.tabId, 'NATIVE_BLOCK_USER', {
            targetUid: op.entry.uid,
            expectedViewer: op.viewerUid,
          });
          if (!result?.ok) {
            const msg = result?.error || e.xBlockUnconfirmed;
            throw result?.code === 'TIMEOUT' ||
              result?.code === 'UNCONFIRMED' ||
              !result?.error
              ? unconfirmedError(msg)
              : new Error(msg);
          }
          await updateOperation(id, (x) => {
            x.nativeX = 'succeeded';
          });
        } else {
          const viewer = await viewerFor(op.tabId, op.viewerUid);
          const result = await post(config, '/v1/blocks/report', {
            targetUid: op.entry.uid,
            targetScreenName: op.entry.screenName,
            targetName: op.entry.name,
            targetFollowersCount: op.followers,
            tag: op.entry.tag ?? 'other',
            reporterUidHash: viewer.reporterHash,
            reporterAccountAgeDays: viewer.accountAgeDays,
            reporterFollowersCount: viewer.followersCount,
          });
          if (
            result.ok !== true ||
            typeof result.countedPublicly !== 'boolean'
          ) {
            throw unconfirmedError(e.communityResponseInvalid);
          }
          await updateOperation(id, (x) => {
            x.community = result.countedPublicly ? 'succeeded' : 'not_counted';
            if (!result.countedPublicly)
              x.errors.community = e.communityNotCountedNote;
          });
        }
      } catch (error) {
        const message = errorText(error);
        const unconfirmed = isUnconfirmedError(error);
        await updateOperation(id, (x) => {
          x[stage] = unconfirmed ? 'unknown' : 'failed';
          x.errors[stage] = message;
        });
      }
    }
  } finally {
    running.delete(id);
    await chrome.alarms.clear(`kxc-op-${id}`);
  }
}
export async function undoBlock(id: string) {
  await enqueue(async () => {
    const config = await readConfig();
    const e = getErrors(config.locale);
    const list = await getOperations(),
      op = list.find((x) => x.id === id);
    assert(op, e.operationNotFound);
    assert(
      !op.cancelled &&
        op.undoUntil > Date.now() &&
        op.nativeX !== 'running' &&
        op.community !== 'running',
      e.undoWindowExpired
    );
    assert(
      digest(config.localBlocklistUids[op.entry.uid]) ===
        digest(op.savedEntry) && !config.whitelistUids[op.entry.uid],
      e.accountModifiedExternally
    );
    delete config.localBlocklistUids[op.entry.uid];
    if (op.previousBlack)
      config.localBlocklistUids[op.entry.uid] = op.previousBlack;
    if (op.previousWhite) config.whitelistUids[op.entry.uid] = op.previousWhite;
    op.cancelled = true;
    op.local = 'cancelled';
    op.nativeX = 'cancelled';
    op.community = 'cancelled';
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config,
      [UI_KEYS.operations]: list,
    });
  });
  await chrome.alarms.clear(`kxc-op-${id}`);
}
export async function changeReason(id: string, tag: AccountListEntry['tag']) {
  await enqueue(async () => {
    const config = await readConfig();
    const e = getErrors(config.locale);
    const list = await getOperations(),
      op = list.find((x) => x.id === id);
    assert(
      op && !op.cancelled && op.undoUntil > Date.now(),
      e.reasonWindowExpired
    );
    assert(
      digest(config.localBlocklistUids[op.entry.uid]) === digest(op.savedEntry),
      e.accountModifiedExternally
    );
    op.entry = validateAccount({ ...op.entry, tag });
    op.savedEntry = op.entry;
    config.localBlocklistUids[op.entry.uid] = op.entry;
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config,
      [UI_KEYS.operations]: list,
    });
  });
}
export async function retryBlock(id: string, stage: 'nativeX' | 'community') {
  await readConfig();
  const e = getActiveErrors();
  await updateOperation(id, (op) => {
    assert(op[stage] === 'failed', e.retryFailedOnly);
    op[stage] = 'pending';
  });
  void runOperation(id, stage);
}
export async function startImport(tabId: number) {
  const config = await readConfig();
  const e = getErrors(config.locale);
  assert(Number.isInteger(tabId), e.selectXTab);
  const job: ImportJob = {
    id: crypto.randomUUID(),
    tabId,
    createdAt: Date.now(),
    status: 'reading',
    ids: [],
    invalid: 0,
    pages: 0,
    localAdded: 0,
    skipped: 0,
    communityAdded: 0,
    communityNotCounted: 0,
    failedBatches: [],
    completedBatches: 0,
  };
  await enqueue(async () => {
    const list = await getImports();
    assert(
      !list.some(
        (x) =>
          x.tabId === tabId &&
          ['reading', 'saving', 'sharing'].includes(x.status)
      ),
      e.tabImportAlreadyRunning
    );
    await chrome.storage.local.set({
      [UI_KEYS.imports]: [job, ...list.slice(0, 9)],
    });
  });
  void readImport(job.id);
  return job.id;
}
async function readImport(id: string) {
  try {
    let cursor = '-1';
    const cursors = new Set<string>();
    const unique = new Set<string>();
    while (cursor !== '0') {
      const e = getActiveErrors();
      const job = (await getImports()).find((x) => x.id === id)!;
      if (job.cancelRequested) return;
      assert(!cursors.has(cursor), e.duplicateCursor);
      cursors.add(cursor);
      const result = await native(job.tabId, 'FETCH_EXISTING_BLOCKS', {
        cursor,
        expectedViewer: job.viewerUid,
      });
      assert(
        result.ok &&
          Array.isArray(result.ids) &&
          typeof result.nextCursor === 'string' &&
          result.viewerUid,
        result.error || e.incompleteBlocklistResponse
      );
      let invalid = 0;
      for (const uid of result.ids) {
        if (UID.test(uid)) unique.add(uid);
        else invalid++;
      }
      cursor = result.nextCursor;
      const next = await updateImport(id, (x) => {
        if (x.cancelRequested) return;
        x.viewerUid = result.viewerUid;
        x.ids = [...unique];
        x.invalid += invalid;
        x.pages++;
      });
      if (next.cancelRequested) return;
    }
    await updateImport(id, (x) => {
      if (!x.cancelRequested) x.status = 'preview';
    });
  } catch (error) {
    await updateImport(id, (x) => {
      if (!x.cancelRequested) {
        x.status = 'error';
        x.error = errorText(error);
      }
    });
  }
}
export async function applyImport(
  id: string,
  share: boolean,
  moveConflicts: boolean
) {
  await readConfig();
  const e0 = getActiveErrors();
  const preview = (await getImports()).find((x) => x.id === id);
  assert(preview?.status === 'preview', e0.rereadPreviewRequired);
  const identity = await native(preview.tabId, 'GET_VIEWER', {
    expectedViewer: preview.viewerUid,
  });
  assert(
    identity.ok && identity.viewerUid === preview.viewerUid,
    e0.xAccountChangedReread
  );
  const job = await enqueue(async () => {
    const config = await readConfig();
    const e = getErrors(config.locale);
    const list = await getImports(),
      job = list.find((x) => x.id === id);
    assert(
      job && job.status === 'preview' && !job.cancelRequested,
      e.rereadPreviewRequired
    );
    assert(!share || config.enableCrowdReport, e.enableCrowdReportFirst);
    const selected: string[] = [];
    for (const uid of job.ids) {
      if (
        config.localBlocklistUids[uid] ||
        (config.whitelistUids[uid] && !moveConflicts)
      ) {
        job.skipped++;
        continue;
      }
      delete config.whitelistUids[uid];
      config.localBlocklistUids[uid] = {
        uid,
        screenName: '',
        reason: e.importedFromXReason,
        addedAt: Date.now(),
      };
      job.localAdded++;
    }
    for (const uid of job.ids)
      if (!config.whitelistUids[uid]) selected.push(uid);
    job.ids = share ? selected : [];
    job.status = share ? 'sharing' : 'done';
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config,
      [UI_KEYS.imports]: list,
    });
    return job;
  });
  if (share) void shareImport(job.id);
  return job.id;
}
async function shareImport(id: string, retry = false) {
  let job = (await getImports()).find((x) => x.id === id)!;
  const batches = retry
    ? job.failedBatches
    : Array.from({ length: Math.ceil(job.ids.length / 500) }, (_, i) =>
        job.ids.slice(i * 500, (i + 1) * 500)
      );
  await updateImport(id, (x) => {
    x.failedBatches = [];
    x.status = 'sharing';
    x.error = undefined;
  });
  for (let i = 0; i < batches.length; i++) {
    job = (await getImports()).find((x) => x.id === id)!;
    if (job.cancelRequested) break;
    try {
      const config = await readConfig();
      const e = getErrors(config.locale);
      assert(config.enableCrowdReport, e.crowdReportDisabledRemaining);
      const viewer = await viewerFor(job.tabId, job.viewerUid);
      const response = await post(config, '/v1/blocks/batch-import', {
        targetUids: batches[i],
        reporterUidHash: viewer.reporterHash,
        reporterAccountAgeDays: viewer.accountAgeDays,
      });
      assert(
        response.ok === true &&
          typeof response.countedPublicly === 'boolean' &&
          Number.isInteger(response.importedCount) &&
          Number(response.importedCount) >= 0 &&
          Number(response.importedCount) <= batches[i].length,
        e.batchResponseInvalid
      );
      await updateImport(id, (x) => {
        x.communityAdded += Number(response.importedCount);
        x.communityNotCounted +=
          batches[i].length - Number(response.importedCount);
        x.completedBatches++;
      });
    } catch (error) {
      await updateImport(id, (x) => {
        x.failedBatches.push(batches[i]);
        x.error = errorText(error);
      });
    }
  }
  await updateImport(id, (x) => {
    x.ids = [];
    x.status = x.cancelRequested ? 'cancelled' : 'done';
  });
}
export async function cancelImport(id: string) {
  await updateImport(id, (x) => {
    x.cancelRequested = true;
    x.status = 'cancelled';
    x.ids = [];
  });
}
export async function retryImport(id: string) {
  await readConfig();
  const e = getActiveErrors();
  const job = (await getImports()).find((x) => x.id === id);
  assert(job?.status === 'done' && job.failedBatches.length, e.noRetryableBatches);
  // A manual retry is explicit; server deduplicates each target/reporter pair.
  await updateImport(id, (x) => {
    x.status = 'sharing';
  });
  void shareImport(id, true);
}
export async function resolveAccount(
  rawQuery: string,
  preferredTabId?: number
): Promise<ResolvedAccount> {
  const { config, logs } = await readState();
  const e = getErrors(config.locale);
  const parsed = parseAccountQuery(rawQuery);

  const knownEntries: ResolvedAccount[] = [
    ...Object.values(config.whitelistUids).map((x) => ({
      uid: x.uid,
      screenName: x.screenName,
      name: x.name,
      avatarUrl: x.avatarUrl,
    })),
    ...Object.values(config.localBlocklistUids).map((x) => ({
      uid: x.uid,
      screenName: x.screenName,
      name: x.name,
      avatarUrl: x.avatarUrl,
    })),
    ...logs.map((x) => ({
      uid: x.authorUid,
      screenName: x.authorScreenName,
      name: x.authorName,
      avatarUrl: x.authorAvatar,
    })),
  ];

  if (parsed.kind === 'uid') {
    const existing = knownEntries.find(
      (x) => x.uid === parsed.uid && (x.screenName || x.name)
    );
    return existing ?? { uid: parsed.uid, screenName: '' };
  }

  const targetLower = parsed.handle.toLowerCase();
  const localMatch = knownEntries.find(
    (x) => UID.test(x.uid) && x.screenName.toLowerCase() === targetLower
  );
  if (localMatch) {
    return localMatch;
  }

  const tabs = (
    await chrome.tabs.query({
      url: ['*://*.x.com/*', '*://*.twitter.com/*'],
    })
  )
    .filter((t) => t.id !== undefined)
    .sort((a, b) => {
      if (a.id === preferredTabId) return -1;
      if (b.id === preferredTabId) return 1;
      return Number(Boolean(b.active)) - Number(Boolean(a.active));
    });

  assert(tabs.length > 0, e.openXTabToResolveHandle(parsed.handle));

  let lastError = e.cannotResolveHandle(parsed.handle);
  for (const tab of tabs) {
    try {
      const res = await native(tab.id, 'RESOLVE_USER_HANDLE', {
        screenName: parsed.handle,
      });
      if (res.ok && res.user && UID.test(res.user.uid)) {
        return {
          uid: res.user.uid,
          screenName: res.user.screenName || parsed.handle,
          name: res.user.name,
          avatarUrl: res.user.avatarUrl,
        };
      }
      if (res.code === 'NOT_FOUND' && res.error) {
        throw notFoundError(res.error);
      }
      if (res.error) lastError = res.error;
    } catch (error) {
      if (isNotFoundError(error)) throw error;
      lastError = errorText(error);
    }
  }
  throw new Error(lastError);
}

export async function resumeJobs() {
  const e = getActiveErrors();
  const list = await getOperations();
  for (const op of list) {
    if (op.nativeX === 'running' || op.community === 'running')
      await updateOperation(op.id, (x) => {
        for (const stage of ['nativeX', 'community'] as const)
          if (x[stage] === 'running') {
            x[stage] = 'unknown';
            x.errors[stage] = e.restartedSyncInterrupted;
          }
      });
    if (
      !op.cancelled &&
      (op.nativeX === 'pending' || op.community === 'pending')
    )
      schedule(op);
  }
  for (const job of await getImports())
    if (['reading', 'saving', 'sharing'].includes(job.status))
      await updateImport(job.id, (x) => {
        x.status = 'error';
        x.error = e.restartedSyncInterrupted;
        x.ids = [];
      });
}
