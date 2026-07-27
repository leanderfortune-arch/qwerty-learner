import { convertFileSrc } from '@tauri-apps/api/core'

export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * 桌面端把发音地址改指向 `pron://` 自定义协议，由 Rust 侧下载、落盘并复用缓存。
 *
 * 不在前端做 fetch + 缓存，是因为有道不返回 `Access-Control-Allow-Origin`，
 * webview 里读不到响应体；Rust 侧不受同源策略约束。
 * 返回的仍是一个同步可用的 URL，播放器无需改成异步。
 *
 * Web 端原样返回，行为不变。
 */
export function toCachedAudioSrc(remoteUrl: string): string {
  if (!IS_DESKTOP || remoteUrl === '') return remoteUrl

  // 地址里的 ? 和 & 若直接进路径，会被自定义协议解析成它自己的查询串，
  // 因此整体做 base64url 编码后再拼接。
  const encoded = btoa(remoteUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return convertFileSrc(encoded, 'pron')
}

/**
 * 摸鱼模式：把主窗口缩成置顶小窗，退出时还原。
 *
 * 复用当前窗口而不是新开一个：两个窗口是两个 webview，React 状态不共享，
 * 会出现两份练习进度往同一个 IndexedDB 写，冲突极难排查。
 */
const MINI_WINDOW_SIZE = { width: 420, height: 320 }
/** 正常模式下的窗口下限，与 tauri.conf.json 中的 minWidth/minHeight 保持一致。 */
const NORMAL_MIN_SIZE = { width: 1024, height: 720 }

let sizeBeforeMini: { width: number; height: number } | null = null

/** 小窗被拖到哪儿就记在哪儿，下次进入摸鱼模式直接回到原位。 */
const MINI_POSITION_KEY = 'miniWindowPosition'

function readStoredMiniPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(MINI_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 「老板键」：全局快捷键，一键把窗口收起，再按一下唤回。
 *
 * 显隐切换在 Rust 侧完成：窗口 hide() 后 webview 的 JS 会被系统挂起，
 * 把回调放在前端会导致按第二次唤不回来。这里只负责开关注册。
 */
export const PANIC_KEY_SHORTCUT = 'CommandOrControl+Alt+K'

async function setPanicKeyEnabled(enabled: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_panic_key_enabled', { enabled })
}

export async function enterMiniWindow(): Promise<void> {
  if (!IS_DESKTOP) return

  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()

  const current = await win.innerSize()
  const scale = await win.scaleFactor()
  const logical = current.toLogical(scale)
  sizeBeforeMini = { width: logical.width, height: logical.height }

  // 必须先放开下限，否则缩不到小窗尺寸。
  await win.setMinSize(new LogicalSize(MINI_WINDOW_SIZE.width, MINI_WINDOW_SIZE.height))
  await win.setSize(new LogicalSize(MINI_WINDOW_SIZE.width, MINI_WINDOW_SIZE.height))
  await win.setAlwaysOnTop(true)

  const stored = readStoredMiniPosition()
  if (stored) {
    const { LogicalPosition } = await import('@tauri-apps/api/dpi')
    await win.setPosition(new LogicalPosition(stored.x, stored.y))
  }

  // 快捷键注册失败（比如被别的软件占用）不该拖垮整个摸鱼模式。
  await setPanicKeyEnabled(true).catch(() => undefined)
}

export async function exitMiniWindow(): Promise<void> {
  if (!IS_DESKTOP) return

  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()

  // 退出前记下小窗当前位置，供下次进入时还原。
  try {
    const pos = await win.outerPosition()
    const scale = await win.scaleFactor()
    const logical = pos.toLogical(scale)
    localStorage.setItem(MINI_POSITION_KEY, JSON.stringify({ x: logical.x, y: logical.y }))
  } catch {
    // 位置记不住不影响退出本身，忽略。
  }

  await setPanicKeyEnabled(false).catch(() => undefined)

  await win.setAlwaysOnTop(false)
  const restore = sizeBeforeMini ?? NORMAL_MIN_SIZE
  await win.setSize(new LogicalSize(restore.width, restore.height))
  await win.setMinSize(new LogicalSize(NORMAL_MIN_SIZE.width, NORMAL_MIN_SIZE.height))
  sizeBeforeMini = null
}
