import {
  STORAGE_KEYS,
  type AccountListEntry,
  type ViewerProfile,
} from '@keepxclean/shared';
import {
  digest,
  errorText,
  UI_KEYS,
  type ImportJob,
  type NativeResult,
  type Operation,
} from '../services/model';
import { assert, UID, validateAccount } from '../services/validation';
import { enqueue, readConfig } from './repository';
import { post } from './remote';

export async function native(
  tabId: number | undefined,
  action: string,
  params: Record<string, unknown> = {}
): Promise<NativeResult> {
  assert(tabId !== undefined, '找不到原 X 标签页，请在 X 中重新操作');
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
          () => reject(new Error('X 请求超时，结果未确认')),
          25000
        );
      }),
    ]);
  } catch (error) {
    throw new Error(`X 连接失败：${errorText(error)}`);
  } finally {
    clearTimeout(timer);
  }
}
async function viewerFor(
  tabId: number | undefined,
  expected?: string
): Promise<ViewerProfile> {
  const result = await native(tabId, 'GET_VIEWER');
  assert(
    result.ok &&
      result.viewerUid &&
      (!expected || expected === result.viewerUid),
    'X 账号已切换或未登录，请重新操作'
  );
  const data = await chrome.storage.local.get(UI_KEYS.viewers);
  const viewer: ViewerProfile | undefined =
    data[UI_KEYS.viewers]?.[String(tabId)];
  assert(
    viewer && viewer.restId === result.viewerUid && viewer.accountAgeDays > 0,
    '尚未读取到当前 X 账号资料，暂未提交社区；请打开自己的 X 主页后重试'
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
    assert(op, '找不到这次操作');
    update(op);
    await chrome.storage.local.set({ [UI_KEYS.operations]: list });
    return op;
  });
}
async function updateImport(id: string, update: (job: ImportJob) => void) {
  return enqueue(async () => {
    const list = await getImports();
    const job = list.find((x) => x.id === id);
    assert(job, '找不到导入任务');
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
          assert(op.viewerUid, '未确认当前 X 账号，请重新打开页面后重试');
          const result = await native(op.tabId, 'NATIVE_BLOCK_USER', {
            targetUid: op.entry.uid,
            expectedViewer: op.viewerUid,
          });
          assert(result?.ok, result?.error || 'X 未确认拉黑结果');
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
          assert(
            result.ok === true && typeof result.countedPublicly === 'boolean',
            '社区响应无效，结果未确认'
          );
          await updateOperation(id, (x) => {
            x.community = result.countedPublicly ? 'succeeded' : 'not_counted';
            if (!result.countedPublicly)
              x.errors.community = '提交已处理，未计入公共统计';
          });
        }
      } catch (error) {
        const message = errorText(error);
        await updateOperation(id, (x) => {
          x[stage] = /未确认|超时/.test(message) ? 'unknown' : 'failed';
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
    const list = await getOperations(),
      op = list.find((x) => x.id === id);
    assert(op, '找不到操作');
    assert(
      !op.cancelled &&
        op.undoUntil > Date.now() &&
        op.nativeX !== 'running' &&
        op.community !== 'running',
      '撤销窗口已结束，外部操作可能已开始'
    );
    const config = await readConfig();
    assert(
      digest(config.localBlocklistUids[op.entry.uid]) ===
        digest(op.savedEntry) && !config.whitelistUids[op.entry.uid],
      '该账号已在其他入口修改，不能覆盖后续操作'
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
    const list = await getOperations(),
      op = list.find((x) => x.id === id);
    assert(
      op && !op.cancelled && op.undoUntil > Date.now(),
      '原因选择窗口已结束'
    );
    const config = await readConfig();
    assert(
      digest(config.localBlocklistUids[op.entry.uid]) === digest(op.savedEntry),
      '账号已被修改'
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
  await updateOperation(id, (op) => {
    assert(
      op[stage] === 'failed',
      '只能重试明确失败的阶段；未确认结果请先在 X 或社区核实'
    );
    op[stage] = 'pending';
  });
  void runOperation(id, stage);
}
export async function startImport(tabId: number) {
  assert(Number.isInteger(tabId), '请选择 X 标签页');
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
      '该标签页已有导入任务'
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
      const job = (await getImports()).find((x) => x.id === id)!;
      if (job.cancelRequested) return;
      assert(!cursors.has(cursor), 'X 返回重复游标，读取已停止');
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
        result.error || 'X 黑名单响应不完整，无法确认是否读取完成'
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
  const preview = (await getImports()).find((x) => x.id === id);
  assert(preview?.status === 'preview', '请重新读取并预览黑名单');
  const identity = await native(preview.tabId, 'GET_VIEWER', {
    expectedViewer: preview.viewerUid,
  });
  assert(
    identity.ok && identity.viewerUid === preview.viewerUid,
    'X 账号已变化，请重新读取黑名单'
  );
  const job = await enqueue(async () => {
    const list = await getImports(),
      job = list.find((x) => x.id === id);
    assert(
      job && job.status === 'preview' && !job.cancelRequested,
      '请重新读取并预览黑名单'
    );
    const config = await readConfig();
    assert(!share || config.enableCrowdReport, '请先在偏好设置开启社区共享');
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
        reason: '从 X 黑名单导入',
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
      assert(config.enableCrowdReport, '社区共享已关闭，后续批次未提交');
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
        '社区批量响应无效，结果未确认'
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
  const job = (await getImports()).find((x) => x.id === id);
  assert(job?.status === 'done' && job.failedBatches.length, '没有可重试批次');
  // A manual retry is explicit; server deduplicates each target/reporter pair.
  await updateImport(id, (x) => {
    x.status = 'sharing';
  });
  void shareImport(id, true);
}
export async function resumeJobs() {
  const list = await getOperations();
  for (const op of list) {
    if (op.nativeX === 'running' || op.community === 'running')
      await updateOperation(op.id, (x) => {
        for (const stage of ['nativeX', 'community'] as const)
          if (x[stage] === 'running') {
            x[stage] = 'unknown';
            x.errors[stage] = '扩展重启，结果未确认';
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
        x.error =
          '扩展重启，导入已中断；已保存的本地结果保留，请重新读取预览。';
        x.ids = [];
      });
}
