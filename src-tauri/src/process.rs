use crate::recommend::{build_command_parts, build_command_preview, LaunchParameters};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct ProcessState {
    child: Mutex<Option<Child>>,
    logs: Arc<Mutex<LogBuffer>>,
}

#[derive(Default)]
struct LogBuffer {
    offset: usize,
    lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatus {
    pub running: bool,
    pub command: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogBatch {
    pub lines: Vec<String>,
    pub next_cursor: usize,
}

impl ProcessState {
    pub fn start(&self, parameters: LaunchParameters) -> Result<ProcessStatus, String> {
        let mut guard = self.child.lock().map_err(|error| error.to_string())?;

        if let Some(child) = guard.as_mut() {
            if child.try_wait().map_err(|error| error.to_string())?.is_none() {
                return Err("llama-server 已在运行，请先停止当前进程。".to_string());
            }
        }

        let command_parts = build_command_parts(&parameters);
        let executable = command_parts
            .first()
            .ok_or_else(|| "缺少 llama-server 路径。".to_string())?;
        let args = &command_parts[1..];

        if executable.trim().is_empty() {
            return Err("请先选择 llama-server.exe。".to_string());
        }
        if parameters.model_path.trim().is_empty() {
            return Err("请先选择 GGUF 模型。".to_string());
        }

        {
            let mut logs = self.logs.lock().map_err(|error| error.to_string())?;
            logs.offset = 0;
            logs.lines.clear();
            logs.lines
                .push(format!("启动命令：{}", build_command_preview(&parameters)));
        }

        let mut command = Command::new(executable);
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command
            .spawn()
            .map_err(|error| format!("启动失败：{error}"))?;

        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader("stdout", stdout, self.logs.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader("stderr", stderr, self.logs.clone());
        }

        *guard = Some(child);

        Ok(ProcessStatus {
            running: true,
            command: Some(build_command_preview(&parameters)),
            message: "llama-server 已启动。".to_string(),
        })
    }

    pub fn stop(&self) -> Result<ProcessStatus, String> {
        let mut guard = self.child.lock().map_err(|error| error.to_string())?;
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
            *guard = None;
            self.push_log("已停止 llama-server。")?;
            return Ok(ProcessStatus {
                running: false,
                command: None,
                message: "llama-server 已停止。".to_string(),
            });
        }

        Ok(ProcessStatus {
            running: false,
            command: None,
            message: "当前没有运行中的 llama-server。".to_string(),
        })
    }

    pub fn status(&self) -> Result<ProcessStatus, String> {
        let mut guard = self.child.lock().map_err(|error| error.to_string())?;
        if let Some(child) = guard.as_mut() {
            if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                *guard = None;
                return Ok(ProcessStatus {
                    running: false,
                    command: None,
                    message: format!("进程已退出：{status}"),
                });
            }

            return Ok(ProcessStatus {
                running: true,
                command: None,
                message: "llama-server 正在运行。".to_string(),
            });
        }

        Ok(ProcessStatus {
            running: false,
            command: None,
            message: "当前没有运行中的 llama-server。".to_string(),
        })
    }

    pub fn logs(&self) -> Result<Vec<String>, String> {
        self.logs
            .lock()
            .map(|logs| logs.lines.clone())
            .map_err(|error| error.to_string())
    }

    pub fn logs_since(&self, cursor: usize) -> Result<LogBatch, String> {
        let logs = self.logs.lock().map_err(|error| error.to_string())?;
        let start_cursor = cursor.max(logs.offset);
        let start_index = start_cursor.saturating_sub(logs.offset).min(logs.lines.len());
        let next_cursor = logs.offset + logs.lines.len();

        Ok(LogBatch {
            lines: logs.lines[start_index..].to_vec(),
            next_cursor,
        })
    }

    fn push_log(&self, message: &str) -> Result<(), String> {
        self.logs
            .lock()
            .map_err(|error| error.to_string())?
            .lines
            .push(message.to_string());
        Ok(())
    }
}

fn spawn_log_reader<R>(label: &'static str, reader: R, logs: Arc<Mutex<LogBuffer>>)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut logs) = logs.lock() {
                logs.lines.push(format!("[{label}] {line}"));
                if logs.lines.len() > 1000 {
                    let removed = 200.min(logs.lines.len());
                    logs.lines.drain(0..removed);
                    logs.offset += removed;
                }
            }
        }
    });
}
