import {
  resolveLocale,
  type SupportedLocale,
  type UILocaleSetting,
} from '@keepxclean/shared';
import type { ExtensionMessages } from './types';
import { getActiveLocaleSetting } from './state';

export type ErrorMessages = ExtensionMessages['errors'];

export const ERROR_LOCALES: Record<SupportedLocale, ErrorMessages> = {
  en: {
    contextInvalidated:
      'Extension was just updated; please reload this X page to continue',
    disconnected:
      'Extension connection lost; please reload the page or extension',
    permissionDenied:
      'Service host permission not granted; previous setting kept',
    serviceAuthRequired: 'Please grant host permission for this service URL first',
    serviceHttpStatus: (status) => `Service returned HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Request timed out; outcome unconfirmed',
    syncFailed: 'Sync failed',
    serviceUrlChanged: 'Service endpoint changed; please sync again',
    restartedSyncInterrupted:
      'Extension restarted during last sync; please retry.',
    corruptSnapshotFallback:
      'Cached community snapshot was corrupted; using built-in packs until next sync.',
    enterAccountQuery: 'Enter an @handle, X profile URL, or numeric UID',
    invalidProfileUrl:
      'Invalid profile URL; expected e.g. https://x.com/username',
    onlyXDomains: 'Only x.com or twitter.com URLs are supported',
    unrecognizedHandleInUrl:
      'Could not extract a valid X @handle from this URL',
    invalidHandleFormat:
      'Enter a valid @handle (1–15 letters, digits, or _), X profile URL, or numeric UID',
    expectObject: (path) => `${path}: expected an object`,
    invalidString: (path) => `${path}: text is empty or too long`,
    invalidNumber: (path, positive, integer) =>
      `${path}: expected a ${positive ? 'positive ' : 'non-negative '}${
        integer ? 'integer' : 'number'
      }`,
    expectBoolean: (path) => `${path}: expected a boolean`,
    invalidRegex:
      'Invalid regular expression; check parentheses, escapes, and quantifiers.',
    selectAtLeastOneScope: 'Match scopes: select at least one valid scope',
    uidNumericOnly: 'Account UID must be 1–25 digits (not an @handle)',
    invalidReasonTag: 'Invalid block reason tag',
    enterFullServiceUrl:
      'Enter a full service URL, e.g. https://api.example.com',
    serviceHttpsOnly:
      'Service URL must use HTTPS (HTTP allowed for localhost only)',
    serviceCleanUrlOnly:
      'Service URL cannot include credentials, query strings, or hash fragments',
    unsupportedConfigVersion:
      'Unsupported config version: only version 1 is supported',
    invalidLocale: 'Invalid interface language code',
    invalidPreset: 'Invalid preset',
    invalidInterceptionMode: 'Invalid display mode',
    invalidLanguageMode: 'Invalid language filter mode',
    unsupportedLanguageCode: 'Contains unsupported language code',
    duplicateKeywordId: 'Duplicate keyword ID',
    uidKeyMismatch: (key) => `${key} map key must match account UID`,
    disjointListsRequired:
      'The same UID cannot exist in both blocklist and allowlist',
    unsupportedSnapshotVersion: 'Unsupported community snapshot version',
    invalidSnapshotTime: 'Invalid snapshot timestamp',
    invalidSnapshotUid: 'Invalid UID in snapshot',
    invalidSnapshotTag: 'Invalid tag in snapshot',
    invalidCloudKeywords: 'Invalid public keyword pack structure',
    unknownConfigField: 'Unknown configuration field',
    unknownRule: 'Unknown filter rule',
    unknownRuleParam: 'Unknown rule parameter',
    configChangedReloadPreview:
      'Configuration changed in another window; please preview again',
    configChangedReconfirmReset:
      'Configuration changed; please confirm reset again',
    configChangedReload: 'Configuration changed; please reload',
    keywordModifiedReopen:
      'This keyword was modified elsewhere; please reopen the editor',
    keywordChangedRefresh: 'Keyword changed; please refresh and retry',
    invalidCloudKeywordId: 'Invalid public keyword ID',
    duplicateCustomKeywordId:
      'Custom keyword ID conflict; please reopen the editor',
    missingXTab: 'Original X tab not found; please retry from X',
    xRequestTimeout: 'X request timed out; outcome unconfirmed',
    xConnectionFailed: (detail) => `X connection failed: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'Active X account changed or signed out; please retry',
    viewerProfileMissing:
      'Your X account profile has not loaded yet; open your X profile page and retry',
    operationNotFound: 'Operation not found',
    importJobNotFound: 'Import job not found',
    viewerUnconfirmed:
      'Active X account unconfirmed; reload the X tab and retry',
    xBlockUnconfirmed: 'X did not confirm the block result',
    communityResponseInvalid:
      'Invalid community server response; outcome unconfirmed',
    communityNotCountedNote: 'Processed, not counted toward public tally',
    undoWindowExpired:
      'Undo window has closed; external sync may already be running',
    accountModifiedExternally:
      'This account was modified from another view; cannot overwrite subsequent changes',
    reasonWindowExpired: 'Reason selection window has closed',
    retryFailedOnly:
      'Only explicitly failed stages can be retried; verify unconfirmed results on X first',
    selectXTab: 'Please select an X tab',
    tabImportAlreadyRunning: 'An import job is already running for this tab',
    duplicateCursor: 'X returned a duplicate cursor; reading stopped',
    incompleteBlocklistResponse:
      'Incomplete X blocklist response; cannot confirm completion',
    rereadPreviewRequired: 'Please read and preview the blocklist again',
    xAccountChangedReread:
      'Active X account changed; please read the blocklist again',
    enableCrowdReportFirst:
      'Enable community sharing in Preferences first',
    importedFromXReason: 'Imported from X blocklist',
    crowdReportDisabledRemaining:
      'Community sharing was turned off; remaining batches skipped',
    batchResponseInvalid:
      'Invalid community batch response; outcome unconfirmed',
    noRetryableBatches: 'No failed batches to retry',
    openXTabToResolveHandle: (handle) =>
      `Open a signed-in X tab to resolve @${handle}, or enter a numeric UID directly`,
    cannotResolveHandle: (handle) => `Could not resolve @${handle} from X`,
    pageUnresponsive: 'X page did not respond; outcome unconfirmed',
    pageClosed: 'Page closed; outcome unconfirmed',
  },
  'zh-CN': {
    contextInvalidated: '扩展刚刚已更新，请刷新当前 X 页面后继续使用',
    disconnected: '扩展连接已断开，请刷新页面或重新加载扩展',
    permissionDenied: '未获得服务访问权限，原配置已保留',
    serviceAuthRequired: '请先授权此服务地址的访问权限',
    serviceHttpStatus: (status) => `服务返回 HTTP ${status}`,
    requestTimeoutUnconfirmed: '请求超时，结果未确认',
    syncFailed: '同步失败',
    serviceUrlChanged: '服务地址已变化，请重新同步',
    restartedSyncInterrupted: '扩展已重启，上次同步中断，请重试。',
    corruptSnapshotFallback: '本地社区快照损坏，暂时使用内置词库，请重新同步。',
    enterAccountQuery: '请输入 @Handle、X 主页链接或数字 UID',
    invalidProfileUrl: '主页链接格式无效，请输入如 https://x.com/username',
    onlyXDomains: '仅支持 x.com 或 twitter.com 链接',
    unrecognizedHandleInUrl: '未能从链接中识别出有效的 X 账号 Handle',
    invalidHandleFormat:
      '请输入有效的 @Handle（1–15 位字母、数字或下划线）、X 主页链接或纯数字 UID',
    expectObject: (path) => `${path}：应为对象`,
    invalidString: (path) => `${path}：文本为空或过长`,
    invalidNumber: (path, positive, integer) =>
      `${path}：请输入${positive ? '正' : '非负'}${integer ? '整数' : '数值'}`,
    expectBoolean: (path) => `${path}：应为开关值`,
    invalidRegex: '正则表达式无效，请检查括号、转义和量词。',
    selectAtLeastOneScope: '匹配范围：至少选择一种有效范围',
    uidNumericOnly: '账号 UID 必须为 1–25 位数字，不能用 Handle 代替',
    invalidReasonTag: '无效的原因标签',
    enterFullServiceUrl: '请输入完整服务地址，例如 https://api.example.com',
    serviceHttpsOnly: '服务地址必须使用 HTTPS；本地开发地址可使用 HTTP',
    serviceCleanUrlOnly: '服务地址不能包含账号、密码、查询参数或片段',
    unsupportedConfigVersion: '配置版本不支持：仅支持 version 1',
    invalidLocale: '无效的界面语言设置',
    invalidPreset: '无效预设',
    invalidInterceptionMode: '无效呈现方式',
    invalidLanguageMode: '语种过滤模式无效',
    unsupportedLanguageCode: '包含不支持的语种代码',
    duplicateKeywordId: '关键词 ID 重复',
    uidKeyMismatch: (key) => `${key} 的键必须与账号 UID 一致`,
    disjointListsRequired: '同一 UID 不能同时存在于黑名单和白名单',
    unsupportedSnapshotVersion: '社区快照版本不支持',
    invalidSnapshotTime: '快照时间无效',
    invalidSnapshotUid: '快照 UID 无效',
    invalidSnapshotTag: '快照标签无效',
    invalidCloudKeywords: '公共词库结构无效',
    unknownConfigField: '未知配置字段',
    unknownRule: '未知规则',
    unknownRuleParam: '未知规则参数',
    configChangedReloadPreview: '配置已在其他窗口修改，请重新预览',
    configChangedReconfirmReset: '配置已变化，请重新确认重置',
    configChangedReload: '配置已变化，请重新加载',
    keywordModifiedReopen: '这条关键词已被修改，请重新打开编辑器',
    keywordChangedRefresh: '关键词已变化，请刷新后重试',
    invalidCloudKeywordId: '公共词条 ID 无效',
    duplicateCustomKeywordId: '自定义关键词 ID 冲突，请重新打开编辑器',
    missingXTab: '找不到原 X 标签页，请在 X 中重新操作',
    xRequestTimeout: 'X 请求超时，结果未确认',
    xConnectionFailed: (detail) => `X 连接失败：${detail}`,
    xAccountSwitchedOrLoggedOut: 'X 账号已切换或未登录，请重新操作',
    viewerProfileMissing:
      '尚未读取到当前 X 账号资料，暂未提交社区；请打开自己的 X 主页后重试',
    operationNotFound: '找不到这次操作',
    importJobNotFound: '找不到导入任务',
    viewerUnconfirmed: '未确认当前 X 账号，请重新打开页面后重试',
    xBlockUnconfirmed: 'X 未确认拉黑结果',
    communityResponseInvalid: '社区响应无效，结果未确认',
    communityNotCountedNote: '提交已处理，未计入公共统计',
    undoWindowExpired: '撤销窗口已结束，外部操作可能已开始',
    accountModifiedExternally: '该账号已在其他入口修改，不能覆盖后续操作',
    reasonWindowExpired: '原因选择窗口已结束',
    retryFailedOnly: '只能重试明确失败的阶段；未确认结果请先在 X 或社区核实',
    selectXTab: '请选择 X 标签页',
    tabImportAlreadyRunning: '该标签页已有导入任务',
    duplicateCursor: 'X 返回重复游标，读取已停止',
    incompleteBlocklistResponse: 'X 黑名单响应不完整，无法确认是否读取完成',
    rereadPreviewRequired: '请重新读取并预览黑名单',
    xAccountChangedReread: 'X 账号已变化，请重新读取黑名单',
    enableCrowdReportFirst: '请先在偏好设置开启社区共享',
    importedFromXReason: '从 X 黑名单导入',
    crowdReportDisabledRemaining: '社区共享已关闭，后续批次未提交',
    batchResponseInvalid: '社区批量响应无效，结果未确认',
    noRetryableBatches: '没有可重试批次',
    openXTabToResolveHandle: (handle) =>
      `请先在浏览器打开并登录 X 页面以自动解析 @${handle}，或直接输入数字 UID`,
    cannotResolveHandle: (handle) => `无法从 X 页面解析 @${handle}`,
    pageUnresponsive: 'X 页面未响应，结果未确认',
    pageClosed: '页面已关闭，结果未确认',
  },
  'zh-TW': {
    contextInvalidated: '擴充功能剛剛已更新，請重新整理目前 X 頁面後繼續使用',
    disconnected: '擴充功能連線已中斷，請重新整理頁面或重新載入擴充功能',
    permissionDenied: '未取得服務存取權限，原設定已保留',
    serviceAuthRequired: '請先授權此服務位址的存取權限',
    serviceHttpStatus: (status) => `服務回傳 HTTP ${status}`,
    requestTimeoutUnconfirmed: '請求逾時，結果未確認',
    syncFailed: '同步失敗',
    serviceUrlChanged: '服務位址已變化，請重新同步',
    restartedSyncInterrupted: '擴充功能已重啟，上次同步中斷，請重試。',
    corruptSnapshotFallback: '本地社群快照損毀，暫時使用內建詞庫，請重新同步。',
    enterAccountQuery: '請輸入 @Handle、X 主頁連結或數字 UID',
    invalidProfileUrl: '主頁連結格式無效，請輸入如 https://x.com/username',
    onlyXDomains: '僅支援 x.com 或 twitter.com 連結',
    unrecognizedHandleInUrl: '未能從連結中識別出有效的 X 帳號 Handle',
    invalidHandleFormat:
      '請輸入有效的 @Handle（1–15 位字母、數字或底線）、X 主頁連結或純數字 UID',
    expectObject: (path) => `${path}：應為物件`,
    invalidString: (path) => `${path}：文字為空或過長`,
    invalidNumber: (path, positive, integer) =>
      `${path}：請輸入${positive ? '正' : '非負'}${integer ? '整數' : '數值'}`,
    expectBoolean: (path) => `${path}：應為布林值`,
    invalidRegex: '正規表示式無效，請檢查括號、跳脫字元與量詞。',
    selectAtLeastOneScope: '比對範圍：至少選擇一種有效範圍',
    uidNumericOnly: '帳號 UID 必須為 1–25 位數字，不能用 Handle 代替',
    invalidReasonTag: '無效的原因標籤',
    enterFullServiceUrl: '請輸入完整服務位址，例如 https://api.example.com',
    serviceHttpsOnly: '服務位址必須使用 HTTPS；本機開發位址可使用 HTTP',
    serviceCleanUrlOnly: '服務位址不能包含帳號、密碼、查詢參數或片段',
    unsupportedConfigVersion: '設定版本不支援：僅支援 version 1',
    invalidLocale: '無效的介面語言設定',
    invalidPreset: '無效預設',
    invalidInterceptionMode: '無效呈現方式',
    invalidLanguageMode: '語種過濾模式無效',
    unsupportedLanguageCode: '包含不支援的語種代碼',
    duplicateKeywordId: '關鍵字 ID 重複',
    uidKeyMismatch: (key) => `${key} 的鍵必須與帳號 UID 一致`,
    disjointListsRequired: '同一 UID 不能同時存在於黑名單和白名單',
    unsupportedSnapshotVersion: '社群快照版本不支援',
    invalidSnapshotTime: '快照時間無效',
    invalidSnapshotUid: '快照 UID 無效',
    invalidSnapshotTag: '快照標籤無效',
    invalidCloudKeywords: '公共詞庫結構無效',
    unknownConfigField: '未知設定欄位',
    unknownRule: '未知規則',
    unknownRuleParam: '未知規則參數',
    configChangedReloadPreview: '設定已在其他視窗修改，請重新預覽',
    configChangedReconfirmReset: '設定已變化，請重新確認重設',
    configChangedReload: '設定已變化，請重新載入',
    keywordModifiedReopen: '這條關鍵字已被修改，請重新開啟編輯器',
    keywordChangedRefresh: '關鍵字已變化，請重新整理後重試',
    invalidCloudKeywordId: '公共詞條 ID 無效',
    duplicateCustomKeywordId: '自訂關鍵字 ID 衝突，請重新開啟編輯器',
    missingXTab: '找不到原 X 分頁，請在 X 中重新操作',
    xRequestTimeout: 'X 請求逾時，結果未確認',
    xConnectionFailed: (detail) => `X 連線失敗：${detail}`,
    xAccountSwitchedOrLoggedOut: 'X 帳號已切換或未登入，請重新操作',
    viewerProfileMissing:
      '尚未讀取到目前 X 帳號資料，暫未提交社群；請開啟自己的 X 主頁後重試',
    operationNotFound: '找不到這次操作',
    importJobNotFound: '找不到匯入任務',
    viewerUnconfirmed: '未確認目前 X 帳號，請重新開啟頁面後重試',
    xBlockUnconfirmed: 'X 未確認封鎖結果',
    communityResponseInvalid: '社群回應無效，結果未確認',
    communityNotCountedNote: '提交已處理，未計入公共統計',
    undoWindowExpired: '復原視窗已結束，外部操作可能已開始',
    accountModifiedExternally: '該帳號已在其他入口修改，不能覆蓋後續操作',
    reasonWindowExpired: '原因選擇視窗已結束',
    retryFailedOnly: '只能重試明確失敗的階段；未確認結果請先在 X 或社群核實',
    selectXTab: '請選擇 X 分頁',
    tabImportAlreadyRunning: '該分頁已有匯入任務',
    duplicateCursor: 'X 回傳重複游標，讀取已停止',
    incompleteBlocklistResponse: 'X 黑名單回應不完整，無法確認是否讀取完成',
    rereadPreviewRequired: '請重新讀取並預覽黑名單',
    xAccountChangedReread: 'X 帳號已變化，請重新讀取黑名單',
    enableCrowdReportFirst: '請先在偏好設定開啟社群共享',
    importedFromXReason: '從 X 黑名單匯入',
    crowdReportDisabledRemaining: '社群共享已關閉，後續批次未提交',
    batchResponseInvalid: '社群批次回應無效，結果未確認',
    noRetryableBatches: '沒有可重試批次',
    openXTabToResolveHandle: (handle) =>
      `請先在瀏覽器開啟並登入 X 頁面以自動解析 @${handle}，或直接輸入數字 UID`,
    cannotResolveHandle: (handle) => `無法從 X 頁面解析 @${handle}`,
    pageUnresponsive: 'X 頁面未回應，結果未確認',
    pageClosed: '頁面已關閉，結果未確認',
  },
  ja: {
    contextInvalidated:
      '拡張機能が更新されました。続行するにはこの X ページを再読み込みしてください',
    disconnected:
      '拡張機能との接続が切れました。ページまたは拡張機能を再読み込みしてください',
    permissionDenied:
      '接続先ドメインの権限が許可されなかったため、元の設定を維持しました',
    serviceAuthRequired: '先にこのサービス URL へのアクセス権限を許可してください',
    serviceHttpStatus: (status) => `サービスが HTTP ${status} を返しました`,
    requestTimeoutUnconfirmed: 'リクエストがタイムアウトし、結果を確認できませんでした',
    syncFailed: '同期に失敗しました',
    serviceUrlChanged: '接続先が変更されました。もう一度同期してください',
    restartedSyncInterrupted:
      '前回の同期中に拡張機能が再起動しました。再試行してください。',
    corruptSnapshotFallback:
      'キャッシュされたスナップショットが破損していたため、次回同期まで内蔵パックを使用します。',
    enterAccountQuery: '@ID、X プロフィール URL、または数値 UID を入力してください',
    invalidProfileUrl:
      'プロフィール URL の形式が正しくありません（例：https://x.com/username）',
    onlyXDomains: 'x.com または twitter.com のリンクのみ対応しています',
    unrecognizedHandleInUrl: 'URL から有効な X の @ID を読み取れませんでした',
    invalidHandleFormat:
      '有効な @ID（英数字と _ で 1〜15 文字）、プロフィール URL、または数値 UID を入力してください',
    expectObject: (path) => `${path}：オブジェクトである必要があります`,
    invalidString: (path) => `${path}：文字列が空か長すぎます`,
    invalidNumber: (path, positive, integer) =>
      `${path}：${positive ? '正の' : '0 以上の'}${integer ? '整数' : '数値'}が必要です`,
    expectBoolean: (path) => `${path}：真偽値である必要があります`,
    invalidRegex:
      '正規表現の構文が無効です。括弧・エスケープ・量指定子を確認してください。',
    selectAtLeastOneScope: '照合範囲を 1 つ以上選択してください',
    uidNumericOnly: 'アカウント UID は 1〜25 桁の数字である必要があります（@ID 不可）',
    invalidReasonTag: '無効なブロック理由カテゴリです',
    enterFullServiceUrl:
      '完全なサービス URL を入力してください（例：https://api.example.com）',
    serviceHttpsOnly:
      'サービス URL は HTTPS を使用してください（localhost のみ HTTP 可）',
    serviceCleanUrlOnly:
      'サービス URL に認証情報・クエリパラメータ・ハッシュは含められません',
    unsupportedConfigVersion:
      '未対応の設定バージョンです（version 1 のみ対応）',
    invalidLocale: '無効な表示言語コードです',
    invalidPreset: '無効なプリセット強度です',
    invalidInterceptionMode: '無効な表示モードです',
    invalidLanguageMode: '無効な言語フィルターモードです',
    unsupportedLanguageCode: '未対応の言語コードが含まれています',
    duplicateKeywordId: '重複するキーワード ID が存在します',
    uidKeyMismatch: (key) => `${key} のキーとアカウント UID が一致しません`,
    disjointListsRequired:
      '同じ UID をブロックリストと許可リストの両方に登録することはできません',
    unsupportedSnapshotVersion: '未対応のスナップショットバージョンです',
    invalidSnapshotTime: 'スナップショットの日時形式が無効です',
    invalidSnapshotUid: 'スナップショット内の UID が無効です',
    invalidSnapshotTag: 'スナップショット内のタグが無効です',
    invalidCloudKeywords: '公開キーワードパックの構造が無効です',
    unknownConfigField: '不明な設定項目が含まれています',
    unknownRule: '不明なフィルタールールです',
    unknownRuleParam: '不明なルールパラメータです',
    configChangedReloadPreview:
      '別の画面で設定が変更されました。再度プレビューしてください',
    configChangedReconfirmReset:
      '設定が変更されました。もう一度リセットを確認してください',
    configChangedReload: '設定が変更されました。再読み込みしてください',
    keywordModifiedReopen:
      'このキーワードは別の場所で変更されました。編集画面を開き直してください',
    keywordChangedRefresh: 'キーワードが更新されました。画面を更新して再試行してください',
    invalidCloudKeywordId: '無効な公開キーワード ID です',
    duplicateCustomKeywordId:
      'カスタムキーワード ID が競合しました。編集画面を開き直してください',
    missingXTab: '元の X タブが見つかりません。X 画面からやり直してください',
    xRequestTimeout: 'X へのリクエストがタイムアウトし、結果を確認できませんでした',
    xConnectionFailed: (detail) => `X ページとの通信に失敗しました：${detail}`,
    xAccountSwitchedOrLoggedOut:
      'ログイン中の X アカウントが切り替わったかログアウトされました。再試行してください',
    viewerProfileMissing:
      '現在の X アカウント情報をまだ取得できていません。X のプロフィールを開いてから再試行してください',
    operationNotFound: '対象の操作レコードが見つかりません',
    importJobNotFound: 'インポートジョブが見つかりません',
    viewerUnconfirmed:
      '現在の X ログイン状態を確認できませんでした。X タブを更新して再試行してください',
    xBlockUnconfirmed: 'X 側でブロック結果を確認できませんでした',
    communityResponseInvalid:
      'コミュニティサーバーの応答が不正なため、結果を確認できませんでした',
    communityNotCountedNote: '処理済み（公開集計の対象外）',
    undoWindowExpired:
      '取り消し猶予が終了しました。外部同期がすでに進行中の可能性があります',
    accountModifiedExternally:
      '別の画面でこのアカウント状態が変更されたため、上書きできません',
    reasonWindowExpired: '理由の選択期間が終了しました',
    retryFailedOnly:
      '明確に失敗した段階のみ再試行できます。未確認の場合は先に X 側の状態を確認してください',
    selectXTab: 'X タブを選択してください',
    tabImportAlreadyRunning: 'このタブでは既にインポートジョブが実行中です',
    duplicateCursor: 'X から重複したページカーソルが返されたため中断しました',
    incompleteBlocklistResponse:
      'X ブロックリストの応答が不完全なため、完了を確認できませんでした',
    rereadPreviewRequired: 'ブロックリストをもう一度読み取ってプレビューしてください',
    xAccountChangedReread:
      'ログイン中の X アカウントが変わりました。再度読み取ってください',
    enableCrowdReportFirst: '先に環境設定でコミュニティ共有を有効にしてください',
    importedFromXReason: 'X ブロックリストから取込',
    crowdReportDisabledRemaining:
      'コミュニティ共有がオフになったため、残りのバッチをスキップしました',
    batchResponseInvalid:
      'コミュニティバッチ応答が不正なため、結果を確認できませんでした',
    noRetryableBatches: '再試行できる失敗バッチはありません',
    openXTabToResolveHandle: (handle) =>
      `@${handle} を解決するにはログイン済みの X タブを開くか、数値 UID を直接入力してください`,
    cannotResolveHandle: (handle) => `X で @${handle} を解決できませんでした`,
    pageUnresponsive: 'X ページが応答しなかったため、結果を確認できませんでした',
    pageClosed: 'ページが閉じられたため、結果を確認できませんでした',
  },
  ko: {
    contextInvalidated:
      '확장 프로그램이 방금 업데이트되었습니다. 계속하려면 이 X 페이지를 새로고침하세요',
    disconnected:
      '확장 프로그램 연결이 끊어졌습니다. 페이지나 확장 프로그램을 새로고침하세요',
    permissionDenied:
      '서비스 도메인 권한이 허용되지 않아 기존 설정을 유지했습니다',
    serviceAuthRequired: '먼저 이 서비스 주소에 대한 호스트 권한을 허용해 주세요',
    serviceHttpStatus: (status) => `서비스가 HTTP ${status} 상태를 반환했습니다`,
    requestTimeoutUnconfirmed: '요청 시간이 초과되어 결과를 확인할 수 없습니다',
    syncFailed: '동기화 실패',
    serviceUrlChanged: '서비스 주소가 변경되었습니다. 다시 동기화해 주세요',
    restartedSyncInterrupted:
      '이전 동기화 중 확장 프로그램이 재시작되었습니다. 다시 시도해 주세요.',
    corruptSnapshotFallback:
      '캐시된 스냅샷이 손상되어 다음 동기화 전까지 내장 팩을 사용합니다.',
    enterAccountQuery: '@아이디, X 프로필 URL 또는 숫자 UID를 입력하세요',
    invalidProfileUrl:
      '올바르지 않은 프로필 URL입니다 (예: https://x.com/username)',
    onlyXDomains: 'x.com 또는 twitter.com 링크만 지원합니다',
    unrecognizedHandleInUrl: 'URL에서 유효한 X @아이디를 찾을 수 없습니다',
    invalidHandleFormat:
      '유효한 @아이디(영문/숫자/_ 1~15자), 프로필 URL 또는 숫자 UID를 입력하세요',
    expectObject: (path) => `${path}: 객체 형식이어야 합니다`,
    invalidString: (path) => `${path}: 텍스트가 비어 있거나 너무 깁니다`,
    invalidNumber: (path, positive, integer) =>
      `${path}: ${positive ? '양수인 ' : '0 이상인 '}${integer ? '정수' : '숫자'}여야 합니다`,
    expectBoolean: (path) => `${path}: 불리언 값이어야 합니다`,
    invalidRegex:
      '정규 표현식이 올바르지 않습니다. 괄호, 이스케이프, 수량자를 확인하세요.',
    selectAtLeastOneScope: '매칭 범위를 최소 1개 이상 선택하세요',
    uidNumericOnly: '계정 UID는 1~25자리 숫자여야 합니다 (@아이디 불가)',
    invalidReasonTag: '유효하지 않은 차단 사유 태그입니다',
    enterFullServiceUrl:
      '전체 서비스 URL을 입력하세요 (예: https://api.example.com)',
    serviceHttpsOnly:
      '서비스 URL은 HTTPS를 사용해야 합니다 (localhost만 HTTP 허용)',
    serviceCleanUrlOnly:
      '서비스 URL에는 계정 정보, 쿼리 문자열 또는 해시를 포함할 수 없습니다',
    unsupportedConfigVersion:
      '지원하지 않는 설정 버전입니다 (버전 1만 지원)',
    invalidLocale: '유효하지 않은 인터페이스 언어 코드입니다',
    invalidPreset: '유효하지 않은 프리셋 값입니다',
    invalidInterceptionMode: '유효하지 않은 표시 방식입니다',
    invalidLanguageMode: '유효하지 않은 언어 필터 모드입니다',
    unsupportedLanguageCode: '지원하지 않는 언어 코드가 포함되어 있습니다',
    duplicateKeywordId: '중복된 키워드 ID가 있습니다',
    uidKeyMismatch: (key) => `${key} 키가 계정 UID와 일치하지 않습니다`,
    disjointListsRequired:
      '동일한 UID가 차단 목록과 허용 목록에 동시에 존재할 수 없습니다',
    unsupportedSnapshotVersion: '지원하지 않는 스냅샷 버전입니다',
    invalidSnapshotTime: '유효하지 않은 스냅샷 시간입니다',
    invalidSnapshotUid: '스냅샷에 유효하지 않은 UID가 있습니다',
    invalidSnapshotTag: '스냅샷에 유효하지 않은 태그가 있습니다',
    invalidCloudKeywords: '공용 키워드 팩 구조가 올바르지 않습니다',
    unknownConfigField: '알 수 없는 설정 필드입니다',
    unknownRule: '알 수 없는 필터 규칙입니다',
    unknownRuleParam: '알 수 없는 규칙 파라미터입니다',
    configChangedReloadPreview:
      '다른 창에서 설정이 변경되었습니다. 다시 미리보기 해주세요',
    configChangedReconfirmReset:
      '설정이 변경되었습니다. 초기화를 다시 확인해 주세요',
    configChangedReload: '설정이 변경되었습니다. 새로고침해 주세요',
    keywordModifiedReopen:
      '이 키워드가 다른 곳에서 수정되었습니다. 편집 창을 다시 열어주세요',
    keywordChangedRefresh: '키워드가 변경되었습니다. 새로고침 후 다시 시도하세요',
    invalidCloudKeywordId: '유효하지 않은 공용 키워드 ID입니다',
    duplicateCustomKeywordId:
      '커스텀 키워드 ID가 충돌했습니다. 편집 창을 다시 열어주세요',
    missingXTab: '원래 X 탭을 찾을 수 없습니다. X 화면에서 다시 시도하세요',
    xRequestTimeout: 'X 요청 시간이 초과되어 결과를 확인할 수 없습니다',
    xConnectionFailed: (detail) => `X 연결 실패: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      '로그인된 X 계정이 바뀌었거나 로그아웃되었습니다. 다시 시도하세요',
    viewerProfileMissing:
      '현재 X 계정 정보를 아직 불러오지 못했습니다. 내 프로필을 한 번 연 뒤 다시 시도하세요',
    operationNotFound: '작업 내역을 찾을 수 없습니다',
    importJobNotFound: '가져오기 작업을 찾을 수 없습니다',
    viewerUnconfirmed:
      '현재 X 로그인 계정을 확인할 수 없습니다. X 탭을 새로고침한 뒤 다시 시도하세요',
    xBlockUnconfirmed: 'X에서 차단 결과를 확인하지 못했습니다',
    communityResponseInvalid:
      '커뮤니티 서버 응답이 올바르지 않아 결과를 확인할 수 없습니다',
    communityNotCountedNote: '처리됨 (공개 집계 제외)',
    undoWindowExpired:
      '실행 취소 시간이 지나 외부 동기화가 이미 진행 중일 수 있습니다',
    accountModifiedExternally:
      '다른 화면에서 이 계정 상태가 변경되어 덮어쓸 수 없습니다',
    reasonWindowExpired: '사유 선택 시간이 종료되었습니다',
    retryFailedOnly:
      '명확히 실패한 단계만 재시도할 수 있습니다. 미확인 상태는 먼저 X에서 확인하세요',
    selectXTab: 'X 탭을 선택하세요',
    tabImportAlreadyRunning: '이 탭에서 이미 가져오기 작업이 실행 중입니다',
    duplicateCursor: 'X에서 중복된 페이지 커서를 반환하여 읽기를 중단했습니다',
    incompleteBlocklistResponse:
      'X 차단 목록 응답이 불완전하여 완료 여부를 확인할 수 없습니다',
    rereadPreviewRequired: '차단 목록을 다시 읽고 미리보기를 확인해 주세요',
    xAccountChangedReread:
      '로그인된 X 계정이 변경되었습니다. 차단 목록을 다시 읽어주세요',
    enableCrowdReportFirst: '먼저 환경설정에서 커뮤니티 공유를 켜주세요',
    importedFromXReason: 'X 차단 목록에서 가져옴',
    crowdReportDisabledRemaining:
      '커뮤니티 공유가 꺼져서 남은 배치를 건너뛰었습니다',
    batchResponseInvalid:
      '커뮤니티 배치 응답이 올바르지 않아 결과를 확인할 수 없습니다',
    noRetryableBatches: '재시도할 실패 배치가 없습니다',
    openXTabToResolveHandle: (handle) =>
      `@${handle} 계정을 조회하려면 로그인된 X 탭을 열거나 숫자 UID를 직접 입력하세요`,
    cannotResolveHandle: (handle) => `X에서 @${handle} 계정을 찾을 수 없습니다`,
    pageUnresponsive: 'X 페이지가 응답하지 않아 결과를 확인할 수 없습니다',
    pageClosed: '페이지가 닫혀 결과를 확인할 수 없습니다',
  },
  es: {
    contextInvalidated:
      'La extensión se acaba de actualizar; recarga esta página de X para continuar',
    disconnected:
      'Se perdió la conexión con la extensión; recarga la página o la extensión',
    permissionDenied:
      'No se concedió permiso al servidor; se mantuvo la configuración anterior',
    serviceAuthRequired: 'Concede primero permiso de acceso para esta URL de servicio',
    serviceHttpStatus: (status) => `El servidor devolvió HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Tiempo de espera agotado; resultado sin confirmar',
    syncFailed: 'Error de sincronización',
    serviceUrlChanged: 'El servidor cambió; vuelve a sincronizar',
    restartedSyncInterrupted:
      'La extensión se reinició durante la sincronización; inténtalo de nuevo.',
    corruptSnapshotFallback:
      'La instantánea en caché estaba dañada; usando paquetes integrados hasta la próxima sincronización.',
    enterAccountQuery: 'Introduce un @usuario, URL de perfil de X o UID numérico',
    invalidProfileUrl:
      'URL de perfil no válida; se esperaba p. ej. https://x.com/usuario',
    onlyXDomains: 'Solo se admiten URLs de x.com o twitter.com',
    unrecognizedHandleInUrl: 'No se pudo extraer un @usuario válido de esta URL',
    invalidHandleFormat:
      'Introduce un @usuario válido (1–15 letras, dígitos o _), URL de X o UID numérico',
    expectObject: (path) => `${path}: se esperaba un objeto`,
    invalidString: (path) => `${path}: texto vacío o demasiado largo`,
    invalidNumber: (path, positive, integer) =>
      `${path}: se esperaba un ${integer ? 'entero' : 'número'} ${positive ? 'positivo' : 'no negativo'}`,
    expectBoolean: (path) => `${path}: se esperaba un booleano`,
    invalidRegex:
      'Expresión regular no válida; revisa paréntesis, escapes y cuantificadores.',
    selectAtLeastOneScope: 'Ámbitos: selecciona al menos un ámbito válido',
    uidNumericOnly: 'El UID debe tener entre 1 y 25 dígitos (no un @usuario)',
    invalidReasonTag: 'Categoría de motivo no válida',
    enterFullServiceUrl:
      'Introduce una URL completa, p. ej. https://api.ejemplo.com',
    serviceHttpsOnly:
      'La URL del servicio debe usar HTTPS (HTTP permitido solo en localhost)',
    serviceCleanUrlOnly:
      'La URL no puede incluir credenciales, parámetros de consulta ni fragmentos #',
    unsupportedConfigVersion:
      'Versión de configuración no soportada: solo se admite la versión 1',
    invalidLocale: 'Código de idioma no válido',
    invalidPreset: 'Ajuste predefinido no válido',
    invalidInterceptionMode: 'Modo de visualización no válido',
    invalidLanguageMode: 'Modo de filtro de idioma no válido',
    unsupportedLanguageCode: 'Contiene un código de idioma no soportado',
    duplicateKeywordId: 'ID de palabra clave duplicado',
    uidKeyMismatch: (key) => `La clave en ${key} debe coincidir con el UID`,
    disjointListsRequired:
      'El mismo UID no puede estar en bloqueados y permitidos a la vez',
    unsupportedSnapshotVersion: 'Versión de instantánea comunitaria no soportada',
    invalidSnapshotTime: 'Marca de tiempo de instantánea no válida',
    invalidSnapshotUid: 'UID no válido en la instantánea',
    invalidSnapshotTag: 'Etiqueta no válida en la instantánea',
    invalidCloudKeywords: 'Estructura de paquetes públicos no válida',
    unknownConfigField: 'Campo de configuración desconocido',
    unknownRule: 'Regla de filtro desconocida',
    unknownRuleParam: 'Parámetro de regla desconocido',
    configChangedReloadPreview:
      'La configuración cambió en otra ventana; vuelve a previsualizar',
    configChangedReconfirmReset:
      'La configuración cambió; vuelve a confirmar el restablecimiento',
    configChangedReload: 'La configuración cambió; recarga la vista',
    keywordModifiedReopen:
      'Esta palabra se modificó en otro lugar; vuelve a abrir el editor',
    keywordChangedRefresh: 'La palabra cambió; actualiza e inténtalo de nuevo',
    invalidCloudKeywordId: 'ID de regla pública no válido',
    duplicateCustomKeywordId:
      'Conflicto de ID de palabra clave; vuelve a abrir el editor',
    missingXTab: 'No se encontró la pestaña original de X; reintenta desde X',
    xRequestTimeout: 'Tiempo agotado en X; resultado sin confirmar',
    xConnectionFailed: (detail) => `Fallo de conexión con X: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'La cuenta activa de X cambió o cerró sesión; inténtalo de nuevo',
    viewerProfileMissing:
      'Tu perfil de X aún no se ha cargado; abre tu perfil en X y reintenta',
    operationNotFound: 'Operación no encontrada',
    importJobNotFound: 'Tarea de importación no encontrada',
    viewerUnconfirmed:
      'Cuenta activa de X sin confirmar; recarga la pestaña de X y reintenta',
    xBlockUnconfirmed: 'X no confirmó el resultado del bloqueo',
    communityResponseInvalid:
      'Respuesta comunitaria no válida; resultado sin confirmar',
    communityNotCountedNote: 'Procesado, no sumado al conteo público',
    undoWindowExpired:
      'El tiempo para deshacer terminó; la sincronización externa puede estar en curso',
    accountModifiedExternally:
      'Esta cuenta fue modificada desde otra vista; no se puede sobrescribir',
    reasonWindowExpired: 'El tiempo para elegir motivo ha terminado',
    retryFailedOnly:
      'Solo pueden reintentarse etapas fallidas; verifica primero en X los estados sin confirmar',
    selectXTab: 'Selecciona una pestaña de X',
    tabImportAlreadyRunning: 'Ya hay una importación en curso en esta pestaña',
    duplicateCursor: 'X devolvió un cursor duplicado; lectura detenida',
    incompleteBlocklistResponse:
      'Respuesta incompleta de la lista de bloqueos de X; no se puede confirmar',
    rereadPreviewRequired: 'Vuelve a leer y previsualizar la lista de bloqueos',
    xAccountChangedReread:
      'La cuenta activa de X cambió; vuelve a leer la lista de bloqueos',
    enableCrowdReportFirst:
      'Activa primero compartir con la comunidad en Preferencias',
    importedFromXReason: 'Importado de bloqueos de X',
    crowdReportDisabledRemaining:
      'Se desactivó compartir con la comunidad; lotes restantes omitidos',
    batchResponseInvalid:
      'Respuesta de lote comunitario no válida; resultado sin confirmar',
    noRetryableBatches: 'No hay lotes fallidos para reintentar',
    openXTabToResolveHandle: (handle) =>
      `Abre una pestaña de X con sesión iniciada para resolver @${handle}, o escribe el UID numérico`,
    cannotResolveHandle: (handle) => `No se pudo resolver @${handle} en X`,
    pageUnresponsive: 'La página de X no respondió; resultado sin confirmar',
    pageClosed: 'La página se cerró; resultado sin confirmar',
  },
  pt: {
    contextInvalidated:
      'A extensão foi atualizada; recarregue esta página do X para continuar',
    disconnected:
      'Conexão perdida com a extensão; recarregue a página ou a extensão',
    permissionDenied:
      'Permissão negada para o servidor; configuração anterior mantida',
    serviceAuthRequired: 'Conceda primeiro permissão de acesso para esta URL de serviço',
    serviceHttpStatus: (status) => `O serviço retornou HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Tempo esgotado; resultado não confirmado',
    syncFailed: 'Falha na sincronização',
    serviceUrlChanged: 'Endpoint alterado; sincronize novamente',
    restartedSyncInterrupted:
      'A extensão reiniciou durante a sincronização; tente novamente.',
    corruptSnapshotFallback:
      'O snapshot em cache estava corrompido; usando pacotes integrados até a próxima sincronização.',
    enterAccountQuery: 'Digite um @usuário, URL de perfil do X ou UID numérico',
    invalidProfileUrl:
      'URL de perfil inválida; esperado ex.: https://x.com/usuario',
    onlyXDomains: 'Apenas URLs de x.com ou twitter.com são suportadas',
    unrecognizedHandleInUrl: 'Não foi possível extrair um @usuário válido desta URL',
    invalidHandleFormat:
      'Digite um @usuário válido (1–15 letras, dígitos ou _), URL do X ou UID numérico',
    expectObject: (path) => `${path}: esperado um objeto`,
    invalidString: (path) => `${path}: texto vazio ou longo demais`,
    invalidNumber: (path, positive, integer) =>
      `${path}: esperado um ${integer ? 'inteiro' : 'número'} ${positive ? 'positivo' : 'não negativo'}`,
    expectBoolean: (path) => `${path}: esperado um booleano`,
    invalidRegex:
      'Expressão regular inválida; verifique parênteses, escapes e quantificadores.',
    selectAtLeastOneScope: 'Escopos: selecione ao menos um escopo válido',
    uidNumericOnly: 'O UID deve ter de 1 a 25 dígitos (não um @usuário)',
    invalidReasonTag: 'Categoria de motivo inválida',
    enterFullServiceUrl:
      'Digite uma URL completa, ex.: https://api.exemplo.com',
    serviceHttpsOnly:
      'A URL do serviço deve usar HTTPS (HTTP permitido apenas em localhost)',
    serviceCleanUrlOnly:
      'A URL não pode conter credenciais, parâmetros de consulta ou #',
    unsupportedConfigVersion:
      'Versão de configuração não suportada: apenas versão 1 é aceita',
    invalidLocale: 'Código de idioma inválido',
    invalidPreset: 'Predefinição inválida',
    invalidInterceptionMode: 'Modo de exibição inválido',
    invalidLanguageMode: 'Modo de filtro de idioma inválido',
    unsupportedLanguageCode: 'Contém código de idioma não suportado',
    duplicateKeywordId: 'ID de palavra-chave duplicado',
    uidKeyMismatch: (key) => `A chave em ${key} deve coincidir com o UID da conta`,
    disjointListsRequired:
      'O mesmo UID não pode existir nas listas de bloqueio e permissão ao mesmo tempo',
    unsupportedSnapshotVersion: 'Versão de snapshot comunitário não suportada',
    invalidSnapshotTime: 'Data/hora do snapshot inválida',
    invalidSnapshotUid: 'UID inválido no snapshot',
    invalidSnapshotTag: 'Tag inválida no snapshot',
    invalidCloudKeywords: 'Estrutura de pacotes públicos inválida',
    unknownConfigField: 'Campo de configuração desconhecido',
    unknownRule: 'Regra de filtro desconhecida',
    unknownRuleParam: 'Parâmetro de regra desconhecido',
    configChangedReloadPreview:
      'A configuração mudou em outra janela; visualize novamente',
    configChangedReconfirmReset:
      'A configuração mudou; confirme a redefinição novamente',
    configChangedReload: 'A configuração mudou; recarregue',
    keywordModifiedReopen:
      'Esta palavra foi alterada em outro local; reabra o editor',
    keywordChangedRefresh: 'A palavra mudou; atualize e tente novamente',
    invalidCloudKeywordId: 'ID de regra pública inválido',
    duplicateCustomKeywordId:
      'Conflito de ID de palavra-chave; reabra o editor',
    missingXTab: 'Aba original do X não encontrada; tente novamente pelo X',
    xRequestTimeout: 'Tempo esgotado no X; resultado não confirmado',
    xConnectionFailed: (detail) => `Falha de conexão com o X: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'A conta ativa do X mudou ou saiu; tente novamente',
    viewerProfileMissing:
      'Seu perfil do X ainda não carregou; abra seu perfil no X e tente novamente',
    operationNotFound: 'Operação não encontrada',
    importJobNotFound: 'Tarefa de importação não encontrada',
    viewerUnconfirmed:
      'Conta ativa do X não confirmada; recarregue a aba do X e tente novamente',
    xBlockUnconfirmed: 'O X não confirmou o resultado do bloqueio',
    communityResponseInvalid:
      'Resposta inválida do servidor comunitário; resultado não confirmado',
    communityNotCountedNote: 'Processado, não incluído na contagem pública',
    undoWindowExpired:
      'A janela de desfazer fechou; a sincronização externa já pode estar em execução',
    accountModifiedExternally:
      'Esta conta foi alterada em outra tela; não é possível sobrescrever',
    reasonWindowExpired: 'A janela de seleção de motivo fechou',
    retryFailedOnly:
      'Apenas etapas com falha explícita podem ser repetidas; verifique estados não confirmados no X primeiro',
    selectXTab: 'Selecione uma aba do X',
    tabImportAlreadyRunning: 'Já existe uma importação em execução nesta aba',
    duplicateCursor: 'O X retornou um cursor duplicado; leitura interrompida',
    incompleteBlocklistResponse:
      'Resposta incompleta da lista de bloqueios do X; não foi possível confirmar',
    rereadPreviewRequired: 'Leia e visualize a lista de bloqueios novamente',
    xAccountChangedReread:
      'A conta ativa do X mudou; leia a lista de bloqueios novamente',
    enableCrowdReportFirst:
      'Ative primeiro o compartilhamento comunitário em Preferências',
    importedFromXReason: 'Importado dos bloqueios do X',
    crowdReportDisabledRemaining:
      'O compartilhamento comunitário foi desligado; lotes restantes ignorados',
    batchResponseInvalid:
      'Resposta inválida de lote comunitário; resultado não confirmado',
    noRetryableBatches: 'Nenhum lote com falha para repetir',
    openXTabToResolveHandle: (handle) =>
      `Abra uma aba conectada do X para resolver @${handle} ou digite o UID numérico`,
    cannotResolveHandle: (handle) => `Não foi possível resolver @${handle} no X`,
    pageUnresponsive: 'A página do X não respondeu; resultado não confirmado',
    pageClosed: 'Página fechada; resultado não confirmado',
  },
  fr: {
    contextInvalidated:
      'L’extension vient d’être mise à jour ; actualisez cette page X pour continuer',
    disconnected:
      'Connexion à l’extension perdue ; actualisez la page ou l’extension',
    permissionDenied:
      'Autorisation d’hôte refusée ; le paramètre précédent a été conservé',
    serviceAuthRequired: 'Veuillez d’abord accorder l’accès à cette URL de service',
    serviceHttpStatus: (status) => `Le service a renvoyé HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Délai dépassé ; résultat non confirmé',
    syncFailed: 'Échec de synchronisation',
    serviceUrlChanged: 'Serveur modifié ; veuillez relancer la synchronisation',
    restartedSyncInterrupted:
      'L’extension a redémarré pendant la synchronisation ; veuillez réessayer.',
    corruptSnapshotFallback:
      'L’instantané en cache était corrompu ; utilisation des packs intégrés jusqu’à la prochaine synchro.',
    enterAccountQuery: 'Saisissez un @pseudo, une URL de profil X ou un UID numérique',
    invalidProfileUrl:
      'URL de profil invalide ; format attendu ex. https://x.com/pseudo',
    onlyXDomains: 'Seules les URL x.com ou twitter.com sont prises en charge',
    unrecognizedHandleInUrl: 'Impossible d’extraire un @pseudo X valide de cette URL',
    invalidHandleFormat:
      'Saisissez un @pseudo valide (1–15 lettres, chiffres ou _), une URL X ou un UID numérique',
    expectObject: (path) => `${path} : objet attendu`,
    invalidString: (path) => `${path} : texte vide ou trop long`,
    invalidNumber: (path, positive, integer) =>
      `${path} : ${integer ? 'entier' : 'nombre'} ${positive ? 'positif' : 'positif ou nul'} attendu`,
    expectBoolean: (path) => `${path} : booléen attendu`,
    invalidRegex:
      'Expression régulière invalide ; vérifiez les parenthèses, échappements et quantificateurs.',
    selectAtLeastOneScope: 'Portées : sélectionnez au moins une portée valide',
    uidNumericOnly: 'L’UID doit contenir 1 à 25 chiffres (pas un @pseudo)',
    invalidReasonTag: 'Catégorie de motif invalide',
    enterFullServiceUrl:
      'Saisissez une URL complète, ex. https://api.exemple.com',
    serviceHttpsOnly:
      'L’URL du service doit utiliser HTTPS (HTTP autorisé sur localhost uniquement)',
    serviceCleanUrlOnly:
      'L’URL ne peut contenir ni identifiants, ni paramètres de requête, ni #',
    unsupportedConfigVersion:
      'Version de configuration non prise en charge : seule la version 1 est acceptée',
    invalidLocale: 'Code de langue invalide',
    invalidPreset: 'Profil prédéfini invalide',
    invalidInterceptionMode: 'Mode d’affichage invalide',
    invalidLanguageMode: 'Mode de filtre de langue invalide',
    unsupportedLanguageCode: 'Contient un code de langue non pris en charge',
    duplicateKeywordId: 'Identifiant de mot-clé en double',
    uidKeyMismatch: (key) => `La clé dans ${key} doit correspondre à l’UID du compte`,
    disjointListsRequired:
      'Un même UID ne peut figurer à la fois dans la liste noire et la liste blanche',
    unsupportedSnapshotVersion: 'Version d’instantané communautaire non prise en charge',
    invalidSnapshotTime: 'Horodatage d’instantané invalide',
    invalidSnapshotUid: 'UID invalide dans l’instantané',
    invalidSnapshotTag: 'Étiquette invalide dans l’instantané',
    invalidCloudKeywords: 'Structure de packs publics invalide',
    unknownConfigField: 'Champ de configuration inconnu',
    unknownRule: 'Règle de filtre inconnue',
    unknownRuleParam: 'Paramètre de règle inconnu',
    configChangedReloadPreview:
      'La configuration a changé dans une autre fenêtre ; relancez l’aperçu',
    configChangedReconfirmReset:
      'La configuration a changé ; reconfirmez la réinitialisation',
    configChangedReload: 'La configuration a changé ; veuillez recharger',
    keywordModifiedReopen:
      'Ce mot-clé a été modifié ailleurs ; rouvrez l’éditeur',
    keywordChangedRefresh: 'Le mot-clé a changé ; actualisez et réessayez',
    invalidCloudKeywordId: 'Identifiant de règle publique invalide',
    duplicateCustomKeywordId:
      'Conflit d’identifiant de mot-clé ; rouvrez l’éditeur',
    missingXTab: 'Onglet X d’origine introuvable ; réessayez depuis X',
    xRequestTimeout: 'Délai d’attente X dépassé ; résultat non confirmé',
    xConnectionFailed: (detail) => `Échec de connexion à X : ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'Le compte X actif a changé ou s’est déconnecté ; réessayez',
    viewerProfileMissing:
      'Votre profil X n’est pas encore chargé ; ouvrez votre profil X et réessayez',
    operationNotFound: 'Opération introuvable',
    importJobNotFound: 'Tâche d’importation introuvable',
    viewerUnconfirmed:
      'Compte X actif non confirmé ; actualisez l’onglet X et réessayez',
    xBlockUnconfirmed: 'X n’a pas confirmé le résultat du blocage',
    communityResponseInvalid:
      'Réponse du serveur communautaire invalide ; résultat non confirmé',
    communityNotCountedNote: 'Traité, non inclus dans le décompte public',
    undoWindowExpired:
      'Le délai d’annulation est écoulé ; la synchronisation externe peut être en cours',
    accountModifiedExternally:
      'Ce compte a été modifié depuis une autre vue ; écrasement impossible',
    reasonWindowExpired: 'Le délai de choix du motif est écoulé',
    retryFailedOnly:
      'Seules les étapes en échec explicite peuvent être relancées ; vérifiez d’abord sur X',
    selectXTab: 'Veuillez sélectionner un onglet X',
    tabImportAlreadyRunning: 'Une importation est déjà en cours sur cet onglet',
    duplicateCursor: 'X a renvoyé un curseur en double ; lecture interrompue',
    incompleteBlocklistResponse:
      'Réponse incomplète de la liste de blocage X ; confirmation impossible',
    rereadPreviewRequired: 'Veuillez relire et prévisualiser la liste de blocage',
    xAccountChangedReread:
      'Le compte X actif a changé ; veuillez relire la liste de blocage',
    enableCrowdReportFirst:
      'Activez d’abord le partage communautaire dans Préférences',
    importedFromXReason: 'Importé depuis les blocages X',
    crowdReportDisabledRemaining:
      'Le partage communautaire a été désactivé ; lots restants ignorés',
    batchResponseInvalid:
      'Réponse de lot communautaire invalide ; résultat non confirmé',
    noRetryableBatches: 'Aucun lot en échec à relancer',
    openXTabToResolveHandle: (handle) =>
      `Ouvrez un onglet X connecté pour résoudre @${handle}, ou saisissez directement l’UID numérique`,
    cannotResolveHandle: (handle) => `Impossible de résoudre @${handle} sur X`,
    pageUnresponsive: 'La page X n’a pas répondu ; résultat non confirmé',
    pageClosed: 'Page fermée ; résultat non confirmé',
  },
  de: {
    contextInvalidated:
      'Erweiterung wurde aktualisiert; bitte lade diese X-Seite neu, um fortzufahren',
    disconnected:
      'Verbindung zur Erweiterung getrennt; bitte Seite oder Erweiterung neu laden',
    permissionDenied:
      'Host-Berechtigung nicht erteilt; vorherige Einstellung beibehalten',
    serviceAuthRequired: 'Bitte erteile zuerst die Berechtigung für diese Dienst-URL',
    serviceHttpStatus: (status) => `Dienst antwortete mit HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Zeitüberschreitung; Ergebnis unbestätigt',
    syncFailed: 'Synchronisierung fehlgeschlagen',
    serviceUrlChanged: 'Endpunkt geändert; bitte erneut synchronisieren',
    restartedSyncInterrupted:
      'Erweiterung während der Synchronisierung neu gestartet; bitte wiederholen.',
    corruptSnapshotFallback:
      'Zwischengespeicherter Snapshot war beschädigt; nutze integrierte Pakete bis zur nächsten Synchronisierung.',
    enterAccountQuery: '@Handle, X-Profil-URL oder numerische UID eingeben',
    invalidProfileUrl:
      'Ungültige Profil-URL; erwartet z. B. https://x.com/nutzername',
    onlyXDomains: 'Nur URLs von x.com oder twitter.com werden unterstützt',
    unrecognizedHandleInUrl: 'Kein gültiges X-@Handle in dieser URL erkannt',
    invalidHandleFormat:
      'Gültiges @Handle (1–15 Buchstaben, Ziffern oder _), X-URL oder numerische UID eingeben',
    expectObject: (path) => `${path}: Objekt erwartet`,
    invalidString: (path) => `${path}: Text ist leer oder zu lang`,
    invalidNumber: (path, positive, integer) =>
      `${path}: ${positive ? 'positive ' : 'nichtnegative '}${integer ? 'Ganzzahl' : 'Zahl'} erwartet`,
    expectBoolean: (path) => `${path}: Wahrheitswert erwartet`,
    invalidRegex:
      'Ungültiger regulärer Ausdruck; prüfe Klammern, Maskierungen und Quantoren.',
    selectAtLeastOneScope: 'Prüfbereiche: mindestens einen gültigen Bereich wählen',
    uidNumericOnly: 'Konto-UID muss aus 1–25 Ziffern bestehen (kein @Handle)',
    invalidReasonTag: 'Ungültige Sperrgrund-Kategorie',
    enterFullServiceUrl:
      'Vollständige Dienst-URL eingeben, z. B. https://api.beispiel.de',
    serviceHttpsOnly:
      'Dienst-URL muss HTTPS verwenden (HTTP nur für localhost erlaubt)',
    serviceCleanUrlOnly:
      'Dienst-URL darf keine Zugangsdaten, Query-Parameter oder # enthalten',
    unsupportedConfigVersion:
      'Nicht unterstützte Konfigurationsversion: nur Version 1 wird unterstützt',
    invalidLocale: 'Ungültiger Sprachcode',
    invalidPreset: 'Ungültige Filterstärke',
    invalidInterceptionMode: 'Ungültiger Darstellungsmodus',
    invalidLanguageMode: 'Ungültiger Sprachfiltermodus',
    unsupportedLanguageCode: 'Enthält nicht unterstützten Sprachcode',
    duplicateKeywordId: 'Doppelte Wortfilter-ID',
    uidKeyMismatch: (key) => `Schlüssel in ${key} muss mit Konto-UID übereinstimmen`,
    disjointListsRequired:
      'Dieselbe UID darf nicht gleichzeitig auf Sperr- und Positivliste stehen',
    unsupportedSnapshotVersion: 'Nicht unterstützte Community-Snapshot-Version',
    invalidSnapshotTime: 'Ungültiger Snapshot-Zeitstempel',
    invalidSnapshotUid: 'Ungültige UID im Snapshot',
    invalidSnapshotTag: 'Ungültiges Tag im Snapshot',
    invalidCloudKeywords: 'Ungültige Struktur der öffentlichen Wortpakete',
    unknownConfigField: 'Unbekanntes Konfigurationsfeld',
    unknownRule: 'Unbekannte Filterregel',
    unknownRuleParam: 'Unbekannter Regelparameter',
    configChangedReloadPreview:
      'Konfiguration in anderem Fenster geändert; bitte Vorschau neu laden',
    configChangedReconfirmReset:
      'Konfiguration geändert; bitte Zurücksetzen erneut bestätigen',
    configChangedReload: 'Konfiguration geändert; bitte neu laden',
    keywordModifiedReopen:
      'Dieser Wortfilter wurde anderweitig geändert; Editor bitte neu öffnen',
    keywordChangedRefresh: 'Wortfilter geändert; bitte aktualisieren und wiederholen',
    invalidCloudKeywordId: 'Ungültige ID der öffentlichen Regel',
    duplicateCustomKeywordId:
      'Wortfilter-ID-Konflikt; bitte Editor neu öffnen',
    missingXTab: 'Ursprünglicher X-Tab nicht gefunden; bitte aus X erneut starten',
    xRequestTimeout: 'X-Anfrage abgelaufen; Ergebnis unbestätigt',
    xConnectionFailed: (detail) => `Verbindung zu X fehlgeschlagen: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'Aktives X-Konto gewechselt oder abgemeldet; bitte erneut versuchen',
    viewerProfileMissing:
      'Dein X-Profil wurde noch nicht geladen; öffne dein X-Profil und versuche es erneut',
    operationNotFound: 'Vorgang nicht gefunden',
    importJobNotFound: 'Importauftrag nicht gefunden',
    viewerUnconfirmed:
      'Aktives X-Konto unbestätigt; lade den X-Tab neu und versuche es erneut',
    xBlockUnconfirmed: 'X hat das Sperrergebnis nicht bestätigt',
    communityResponseInvalid:
      'Ungültige Antwort vom Community-Server; Ergebnis unbestätigt',
    communityNotCountedNote: 'Verarbeitet, nicht in öffentliche Zählung aufgenommen',
    undoWindowExpired:
      'Rückgängig-Frist abgelaufen; externe Synchronisierung läuft möglicherweise bereits',
    accountModifiedExternally:
      'Dieses Konto wurde in einer anderen Ansicht geändert; Überschreiben nicht möglich',
    reasonWindowExpired: 'Zeitfenster für die Grundauswahl ist abgelaufen',
    retryFailedOnly:
      'Nur eindeutig fehlgeschlagene Schritte können wiederholt werden; prüfe unbestätigte Fälle zuerst auf X',
    selectXTab: 'Bitte wähle einen X-Tab aus',
    tabImportAlreadyRunning: 'In diesem Tab läuft bereits ein Import',
    duplicateCursor: 'X lieferte einen doppelten Seiten-Cursor; Einlesen gestoppt',
    incompleteBlocklistResponse:
      'Unvollständige X-Blocklisten-Antwort; Abschluss nicht bestätigbar',
    rereadPreviewRequired: 'Bitte Blockliste erneut einlesen und prüfen',
    xAccountChangedReread:
      'Aktives X-Konto geändert; bitte Blockliste erneut einlesen',
    enableCrowdReportFirst:
      'Aktiviere zuerst Community-Teilen in den Einstellungen',
    importedFromXReason: 'Aus X-Blockliste importiert',
    crowdReportDisabledRemaining:
      'Community-Teilen wurde deaktiviert; verbleibende Stapel übersprungen',
    batchResponseInvalid:
      'Ungültige Community-Stapelantwort; Ergebnis unbestätigt',
    noRetryableBatches: 'Keine fehlgeschlagenen Stapel zum Wiederholen',
    openXTabToResolveHandle: (handle) =>
      `Öffne einen angemeldeten X-Tab, um @${handle} aufzulösen, oder gib direkt die numerische UID ein`,
    cannotResolveHandle: (handle) => `@${handle} konnte auf X nicht aufgelöst werden`,
    pageUnresponsive: 'X-Seite antwortete nicht; Ergebnis unbestätigt',
    pageClosed: 'Seite geschlossen; Ergebnis unbestätigt',
  },
  ru: {
    contextInvalidated:
      'Расширение только что обновилось — перезагрузите эту страницу X для продолжения',
    disconnected:
      'Связь с расширением потеряна — обновите страницу или расширение',
    permissionDenied:
      'Доступ к хосту не предоставлен; сохранён прежний адрес',
    serviceAuthRequired: 'Сначала предоставьте доступ к этому адресу службы',
    serviceHttpStatus: (status) => `Сервер вернул HTTP ${status}`,
    requestTimeoutUnconfirmed: 'Время ожидания истекло; результат не подтверждён',
    syncFailed: 'Ошибка синхронизации',
    serviceUrlChanged: 'Адрес сервера изменился; выполните синхронизацию заново',
    restartedSyncInterrupted:
      'Расширение перезапустилось во время синхронизации; повторите попытку.',
    corruptSnapshotFallback:
      'Кешированный снимок повреждён; используются встроенные наборы до следующей синхронизации.',
    enterAccountQuery: 'Введите @ник, ссылку на профиль X или числовой UID',
    invalidProfileUrl:
      'Некорректная ссылка профиля; ожидается напр. https://x.com/username',
    onlyXDomains: 'Поддерживаются только ссылки x.com и twitter.com',
    unrecognizedHandleInUrl: 'Не удалось извлечь корректный @ник X из ссылки',
    invalidHandleFormat:
      'Введите корректный @ник (1–15 букв, цифр или _), ссылку X или числовой UID',
    expectObject: (path) => `${path}: ожидается объект`,
    invalidString: (path) => `${path}: строка пуста или слишком длинная`,
    invalidNumber: (path, positive, integer) =>
      `${path}: ожидается ${positive ? 'положительное ' : 'неотрицательное '}${integer ? 'целое число' : 'число'}`,
    expectBoolean: (path) => `${path}: ожидается логическое значение`,
    invalidRegex:
      'Некорректное регулярное выражение; проверьте скобки, экранирование и квантификаторы.',
    selectAtLeastOneScope: 'Области поиска: выберите хотя бы одну область',
    uidNumericOnly: 'UID аккаунта должен состоять из 1–25 цифр (не @ник)',
    invalidReasonTag: 'Недопустимая категория причины блокировки',
    enterFullServiceUrl:
      'Введите полный URL службы, напр. https://api.example.com',
    serviceHttpsOnly:
      'URL службы должен использовать HTTPS (HTTP разрешён только для localhost)',
    serviceCleanUrlOnly:
      'URL службы не должен содержать логин/пароль, параметры запроса или #',
    unsupportedConfigVersion:
      'Неподдерживаемая версия конфигурации: поддерживается только версия 1',
    invalidLocale: 'Недопустимый код языка интерфейса',
    invalidPreset: 'Недопустимый профиль интенсивности',
    invalidInterceptionMode: 'Недопустимый режим отображения',
    invalidLanguageMode: 'Недопустимый режим языкового фильтра',
    unsupportedLanguageCode: 'Содержит неподдерживаемый код языка',
    duplicateKeywordId: 'Дублирующийся ID ключевого слова',
    uidKeyMismatch: (key) => `Ключ в ${key} должен совпадать с UID аккаунта`,
    disjointListsRequired:
      'Один и тот же UID не может одновременно находиться в чёрном и белом списках',
    unsupportedSnapshotVersion: 'Неподдерживаемая версия снимка сообщества',
    invalidSnapshotTime: 'Некорректная метка времени снимка',
    invalidSnapshotUid: 'Некорректный UID в снимке',
    invalidSnapshotTag: 'Некорректная метка в снимке',
    invalidCloudKeywords: 'Некорректная структура общих ключевых слов',
    unknownConfigField: 'Неизвестное поле конфигурации',
    unknownRule: 'Неизвестное правило фильтрации',
    unknownRuleParam: 'Неизвестный параметр правила',
    configChangedReloadPreview:
      'Настройки изменились в другом окне; откройте предпросмотр заново',
    configChangedReconfirmReset:
      'Настройки изменились; подтвердите сброс ещё раз',
    configChangedReload: 'Настройки изменились; обновите страницу',
    keywordModifiedReopen:
      'Это слово было изменено в другом месте; откройте редактор заново',
    keywordChangedRefresh: 'Ключевое слово изменилось; обновите и повторите',
    invalidCloudKeywordId: 'Недопустимый ID общего правила',
    duplicateCustomKeywordId:
      'Конфликт ID ключевого слова; откройте редактор заново',
    missingXTab: 'Исходная вкладка X не найдена; повторите действие из X',
    xRequestTimeout: 'Таймаут запроса к X; результат не подтверждён',
    xConnectionFailed: (detail) => `Ошибка связи с X: ${detail}`,
    xAccountSwitchedOrLoggedOut:
      'Активный аккаунт X сменился или выполнен выход; повторите попытку',
    viewerProfileMissing:
      'Профиль вашего аккаунта X ещё не загружен; откройте свой профиль в X и повторите',
    operationNotFound: 'Операция не найдена',
    importJobNotFound: 'Задача импорта не найдена',
    viewerUnconfirmed:
      'Активный аккаунт X не подтверждён; обновите вкладку X и повторите',
    xBlockUnconfirmed: 'X не подтвердил результат блокировки',
    communityResponseInvalid:
      'Некорректный ответ сервера сообщества; результат не подтверждён',
    communityNotCountedNote: 'Обработано, не включено в публичный счётчик',
    undoWindowExpired:
      'Время отмены истекло; внешняя синхронизация уже может выполняться',
    accountModifiedExternally:
      'Статус аккаунта изменён в другом окне; перезапись невозможна',
    reasonWindowExpired: 'Время выбора причины истекло',
    retryFailedOnly:
      'Повторить можно только явно завершившиеся ошибкой этапы; сначала проверьте статус в X',
    selectXTab: 'Выберите вкладку X',
    tabImportAlreadyRunning: 'В этой вкладке уже выполняется импорт',
    duplicateCursor: 'X вернул повторяющийся курсор страницы; чтение остановлено',
    incompleteBlocklistResponse:
      'Неполный ответ списка блокировок X; невозможно подтвердить завершение',
    rereadPreviewRequired: 'Прочитайте и проверьте список блокировок заново',
    xAccountChangedReread:
      'Активный аккаунт X изменился; прочитайте список заново',
    enableCrowdReportFirst:
      'Сначала включите обмен с сообществом в «Параметрах»',
    importedFromXReason: 'Импортировано из ЧС X',
    crowdReportDisabledRemaining:
      'Обмен с сообществом был выключен; оставшиеся пакеты пропущены',
    batchResponseInvalid:
      'Некорректный ответ пакетной отправки; результат не подтверждён',
    noRetryableBatches: 'Нет пакетов с ошибкой для повтора',
    openXTabToResolveHandle: (handle) =>
      `Откройте вкладку X со входом для поиска @${handle} или введите числовой UID напрямую`,
    cannotResolveHandle: (handle) => `Не удалось найти @${handle} в X`,
    pageUnresponsive: 'Страница X не ответила; результат не подтверждён',
    pageClosed: 'Страница закрыта; результат не подтверждён',
  },
};

export function getErrors(
  setting: UILocaleSetting = getActiveLocaleSetting()
): ErrorMessages {
  const locale = resolveLocale(setting);
  return ERROR_LOCALES[locale] ?? ERROR_LOCALES.en;
}

export function getActiveErrors(): ErrorMessages {
  return getErrors(getActiveLocaleSetting());
}
