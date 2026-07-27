// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 整窗半透明。
///
/// 走 NSWindow 的 `alphaValue`——这是 AppKit 的公开属性，与「背景逐像素透明」
/// （`transparent: true`，macOS 上需要私有 API 且未能生效）是两套机制：
/// 它只是把整个窗口按比例混合到桌面上，不涉及 WebView 的合成层。
#[cfg(target_os = "macos")]
#[tauri::command]
fn set_window_alpha(window: tauri::WebviewWindow, alpha: f64) -> Result<(), String> {
    use objc2::runtime::AnyObject;

    let ns_window = window.ns_window().map_err(|err| err.to_string())? as *mut AnyObject;
    if ns_window.is_null() {
        return Err("ns_window is null".into());
    }

    // 全透明会让窗口彻底点不到，留一个下限。
    let alpha = alpha.clamp(0.2, 1.0);
    unsafe {
        let _: () = objc2::msg_send![ns_window, setAlphaValue: alpha];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn set_window_alpha(_window: tauri::WebviewWindow, _alpha: f64) -> Result<(), String> {
    Err("only supported on macOS".into())
}

/// 摸鱼模式的「老板键」。
///
/// 切换窗口显隐必须在 Rust 侧完成：窗口一旦 hide()，webview 的 JS 运行时会被
/// 系统挂起，注册在前端的快捷键回调收不到后续按键，窗口就再也唤不回来。
const PANIC_KEY_SHORTCUT: &str = "CommandOrControl+Alt+K";

/// 自己记录是否已被老板键收起。
///
/// 不用 `is_visible()` 判断：macOS 上 hide() 之后它仍可能报告为可见，
/// 于是第二次按键又执行一次隐藏，窗口再也回不来。
static PANIC_HIDDEN: AtomicBool = AtomicBool::new(false);

/// 由前端在进出摸鱼模式时调用。全局快捷键会拦截整个系统的按键，
/// 因此只在摸鱼模式期间占用。
#[tauri::command]
fn set_panic_key_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let result = if enabled {
        shortcuts.register(PANIC_KEY_SHORTCUT)
    } else {
        // 退出摸鱼模式时若窗口正被收起，先还原，否则用户失去唤回入口。
        if PANIC_HIDDEN.swap(false, Ordering::SeqCst) {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        shortcuts.unregister(PANIC_KEY_SHORTCUT)
    };
    result.map_err(|err| err.to_string())
}

/// 发音音频只允许代理这一个来源，避免自定义协议变成任意 URL 的转发器。
const ALLOWED_AUDIO_HOST: &str = "dict.youdao.com";

/// 有道对超长输入会直接 500，这里给一个宽松上限挡掉明显异常的请求。
const MAX_REMOTE_URL_LEN: usize = 512;

fn error_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("failed to build error response")
}

fn audio_response(bytes: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "audio/mpeg")
        // 音频按 URL 内容寻址，缓存后不会再变，可以让 webview 长期持有。
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .body(bytes)
        .expect("failed to build audio response")
}

/// 从 `pron://` 请求里取出被代理的远端地址。
///
/// 前端用 base64url 编码后拼进路径，这样地址里的 `?` `&` 不会被当成
/// 自定义协议自己的查询串解析。
fn decode_remote_url(request: &Request<Vec<u8>>) -> Option<String> {
    let encoded = request.uri().path().trim_start_matches('/');
    if encoded.is_empty() {
        return None;
    }

    let decoded = URL_SAFE_NO_PAD.decode(encoded).ok()?;
    let url = String::from_utf8(decoded).ok()?;
    if url.len() > MAX_REMOTE_URL_LEN {
        return None;
    }

    let parsed = reqwest::Url::parse(&url).ok()?;
    if parsed.scheme() != "https" || parsed.host_str() != Some(ALLOWED_AUDIO_HOST) {
        return None;
    }

    Some(url)
}

/// 缓存文件按远端地址的 sha256 命名：同一个词 + 同一种发音必然落到同一个文件，
/// 而词本身可能含有空格、斜杠等不适合直接做文件名的字符。
fn cache_path_for(cache_dir: &PathBuf, remote_url: &str) -> PathBuf {
    let digest = Sha256::digest(remote_url.as_bytes());
    cache_dir.join(format!("{:x}.mp3", digest))
}

async fn load_or_fetch(cache_dir: PathBuf, remote_url: String) -> Result<Vec<u8>, StatusCode> {
    let path = cache_path_for(&cache_dir, &remote_url);

    if let Ok(bytes) = tokio::fs::read(&path).await {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }

    let response = reqwest::get(&remote_url)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // 有道查不到音频时返回 500 + 一段 JSON，不能把它当成音频缓存下来。
    if !response.status().is_success() {
        return Err(StatusCode::NOT_FOUND);
    }
    let is_audio = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("audio/"));
    if !is_audio {
        return Err(StatusCode::NOT_FOUND);
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
        .to_vec();
    if bytes.is_empty() {
        return Err(StatusCode::NOT_FOUND);
    }

    // 写盘失败不影响本次播放，只是下次还得重新下载。
    if tokio::fs::create_dir_all(&cache_dir).await.is_ok() {
        let _ = tokio::fs::write(&path, &bytes).await;
    }

    Ok(bytes)
}

fn handle_pronunciation_request<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let Some(remote_url) = decode_remote_url(&request) else {
        responder.respond(error_response(StatusCode::BAD_REQUEST));
        return;
    };

    let Ok(cache_dir) = context
        .app_handle()
        .path()
        .app_cache_dir()
        .map(|dir| dir.join("pronunciation"))
    else {
        responder.respond(error_response(StatusCode::INTERNAL_SERVER_ERROR));
        return;
    };

    tauri::async_runtime::spawn(async move {
        match load_or_fetch(cache_dir, remote_url).await {
            Ok(bytes) => responder.respond(audio_response(bytes)),
            Err(status) => responder.respond(error_response(status)),
        }
    });
}

fn main() {
    tauri::Builder::default()
        // 摸鱼模式的「老板键」：一键把窗口收起来，再按一下唤回。
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // 按下与抬起都会回调，只处理按下，否则一次按键切换两次。
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };
                    if PANIC_HIDDEN.swap(false, Ordering::SeqCst) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        PANIC_HIDDEN.store(true, Ordering::SeqCst);
                        let _ = window.hide();
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_panic_key_enabled, set_window_alpha])
        .register_asynchronous_uri_scheme_protocol("pron", handle_pronunciation_request)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
