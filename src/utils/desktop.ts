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
}

export async function exitMiniWindow(): Promise<void> {
  if (!IS_DESKTOP) return

  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()

  await win.setAlwaysOnTop(false)
  const restore = sizeBeforeMini ?? NORMAL_MIN_SIZE
  await win.setSize(new LogicalSize(restore.width, restore.height))
  await win.setMinSize(new LogicalSize(NORMAL_MIN_SIZE.width, NORMAL_MIN_SIZE.height))
  sizeBeforeMini = null
}
