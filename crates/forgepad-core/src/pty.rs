use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

use crate::{err, CoreResult};

const MAX_REPLAY_BYTES: usize = 8_000_000;

type PtyDataHandler = Arc<dyn Fn(String, String) + Send + Sync + 'static>;
type PtyExitHandler = Arc<dyn Fn(String, i32) + Send + Sync + 'static>;

pub struct PtyManager {
    handles: Arc<Mutex<HashMap<String, PtyHandle>>>,
    exited_replays: Arc<Mutex<HashMap<String, String>>>,
    next_pty: Mutex<u64>,
    on_data: PtyDataHandler,
    on_exit: PtyExitHandler,
}

struct PtyHandle {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    replay: Arc<Mutex<String>>,
    #[cfg(unix)]
    process_group_leader: Option<libc::pid_t>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyReplay {
    pub replay: String,
    pub alive: bool,
}

impl PtyManager {
    pub fn new(
        on_data: impl Fn(String, String) + Send + Sync + 'static,
        on_exit: impl Fn(String, i32) + Send + Sync + 'static,
    ) -> Self {
        Self {
            handles: Arc::new(Mutex::new(HashMap::new())),
            exited_replays: Arc::new(Mutex::new(HashMap::new())),
            next_pty: Mutex::new(0),
            on_data: Arc::new(on_data),
            on_exit: Arc::new(on_exit),
        }
    }

    pub fn create(
        &self,
        worktree_path: String,
        shell: Option<String>,
        command: Option<String>,
        extra_env: Option<HashMap<String, String>>,
    ) -> CoreResult<String> {
        let mut next = self.next_pty.lock().unwrap();
        *next += 1;
        let id = format!("pty-{}", *next);
        drop(next);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(err)?;

        let (shell_path, shell_args) = default_shell_command(shell);
        let mut cmd = CommandBuilder::new(shell_path);
        for arg in shell_args {
            cmd.arg(arg);
        }
        cmd.cwd(worktree_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("FORGEPAD_PTY_ID", &id);
        if let Some(env) = extra_env {
            for (key, value) in env {
                cmd.env(key, value);
            }
        }

        let child = pair.slave.spawn_command(cmd).map_err(err)?;
        #[cfg(unix)]
        let process_group_leader = pair.master.process_group_leader();
        let writer = pair.master.take_writer().map_err(err)?;
        let mut reader = pair.master.try_clone_reader().map_err(err)?;
        let master = Arc::new(Mutex::new(pair.master));
        let replay = Arc::new(Mutex::new(String::new()));
        let replay_reader = Arc::clone(&replay);
        let child_reader = Arc::new(Mutex::new(child));
        let child_for_reader = Arc::clone(&child_reader);
        let handles = Arc::clone(&self.handles);
        let exited_replays = Arc::clone(&self.exited_replays);
        let on_data = Arc::clone(&self.on_data);
        let on_exit = Arc::clone(&self.on_exit);
        let reader_id = id.clone();

        let writer = Arc::new(Mutex::new(writer));
        self.handles.lock().unwrap().insert(
            id.clone(),
            PtyHandle {
                master,
                writer,
                child: child_reader,
                replay,
                #[cfg(unix)]
                process_group_leader,
            },
        );
        self.exited_replays.lock().unwrap().remove(&id);
        if let Some(command) = command {
            if let Some(pty) = self.handles.lock().unwrap().get(&id) {
                let _ = pty
                    .writer
                    .lock()
                    .unwrap()
                    .write_all(format!("{command}\n").as_bytes());
            }
        }

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        push_replay(&replay_reader, &data);
                        on_data(reader_id.clone(), data);
                    }
                }
            }
            let exit_code = child_for_reader
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok().flatten())
                .map(|status| status.exit_code() as i32)
                .unwrap_or(0);
            let replay_snapshot = replay_reader
                .lock()
                .map(|replay| replay.clone())
                .unwrap_or_default();
            if let Ok(mut handles) = handles.lock() {
                handles.remove(&reader_id);
            }
            if let Ok(mut exited_replays) = exited_replays.lock() {
                exited_replays.insert(reader_id.clone(), replay_snapshot);
                trim_exited_replays(&mut exited_replays);
            }
            on_exit(reader_id, exit_code);
        });
        Ok(id)
    }

    pub fn write(&self, id: &str, data: &str) -> CoreResult<()> {
        if let Some(pty) = self.handles.lock().unwrap().get(id) {
            pty.writer
                .lock()
                .unwrap()
                .write_all(data.as_bytes())
                .map_err(err)?;
        }
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> CoreResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        if let Some(pty) = self.handles.lock().unwrap().get(id) {
            pty.master
                .lock()
                .unwrap()
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(err)?;
        }
        Ok(())
    }

    pub fn destroy(&self, id: &str) -> CoreResult<()> {
        if let Some(pty) = self.handles.lock().unwrap().remove(id) {
            terminate_pty(&pty);
            self.exited_replays
                .lock()
                .unwrap()
                .insert(id.to_string(), pty.replay.lock().unwrap().clone());
        } else {
            self.exited_replays.lock().unwrap().remove(id);
        }
        Ok(())
    }

    pub fn shutdown_all(&self) {
        let handles = {
            let mut handles = self.handles.lock().unwrap();
            std::mem::take(&mut *handles)
        };
        for (_, pty) in handles {
            terminate_pty(&pty);
        }
        if let Ok(mut exited_replays) = self.exited_replays.lock() {
            exited_replays.clear();
        }
    }

    pub fn reattach(&self, id: &str) -> PtyReplay {
        if let Some(pty) = self.handles.lock().unwrap().get(id) {
            PtyReplay {
                replay: pty.replay.lock().unwrap().clone(),
                alive: true,
            }
        } else if let Some(replay) = self.exited_replays.lock().unwrap().get(id) {
            PtyReplay {
                replay: replay.clone(),
                alive: false,
            }
        } else {
            PtyReplay {
                replay: String::new(),
                alive: false,
            }
        }
    }
}

fn terminate_pty(pty: &PtyHandle) {
    #[cfg(unix)]
    if let Some(pgid) = pty.process_group_leader {
        unsafe {
            libc::killpg(pgid, libc::SIGTERM);
        }
        std::thread::sleep(Duration::from_millis(100));
        unsafe {
            libc::killpg(pgid, libc::SIGKILL);
        }
        return;
    }

    if let Ok(mut child) = pty.child.lock() {
        let _ = child.kill();
    }
}

fn trim_exited_replays(replays: &mut HashMap<String, String>) {
    const MAX_EXITED_REPLAYS: usize = 64;
    if replays.len() <= MAX_EXITED_REPLAYS {
        return;
    }
    let mut keys = replays.keys().cloned().collect::<Vec<_>>();
    keys.sort();
    for key in keys.into_iter().take(replays.len() - MAX_EXITED_REPLAYS) {
        replays.remove(&key);
    }
}

pub fn split_shell(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for ch in input.chars() {
        match (quote, ch) {
            (Some(q), c) if c == q => quote = None,
            (None, '\'' | '"') => quote = Some(ch),
            (None, c) if c.is_whitespace() => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            (_, c) => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

pub fn default_shell_command(shell: Option<String>) -> (String, Vec<String>) {
    if let Some(shell) = shell {
        let parts = split_shell(shell.trim());
        if let Some((program, args)) = parts.split_first() {
            return (program.to_string(), args.to_vec());
        }
    }

    let program = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let name = Path::new(&program)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let args = if name.contains("zsh") || name.contains("bash") || name.contains("fish") {
        vec!["-l".to_string()]
    } else {
        Vec::new()
    };
    (program, args)
}

fn push_replay(replay: &Arc<Mutex<String>>, data: &str) {
    if let Ok(mut replay) = replay.lock() {
        replay.push_str(data);
        if replay.len() > MAX_REPLAY_BYTES {
            let drain = replay.len() - MAX_REPLAY_BYTES;
            replay.drain(..drain);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_shell_keeps_quoted_args_together() {
        assert_eq!(
            split_shell("/bin/zsh -lc \"echo hello\""),
            vec!["/bin/zsh", "-lc", "echo hello"]
        );
    }

    #[test]
    fn default_shell_uses_explicit_program_and_args() {
        assert_eq!(
            default_shell_command(Some("/bin/bash -lc".into())),
            ("/bin/bash".into(), vec!["-lc".into()])
        );
    }
}
