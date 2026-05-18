pub mod agent_history;
pub mod app;
pub mod command;
pub mod context;
pub mod files;
pub mod git;
pub mod hooks;
pub mod lsp;
pub mod pets;
pub mod pty;
pub mod state;

pub type CoreResult<T> = Result<T, String>;

pub(crate) fn err<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}
