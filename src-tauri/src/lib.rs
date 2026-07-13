pub mod curlgen;
pub mod engine;
pub mod importers;
pub mod interp;
pub mod models;
pub mod resolve;
pub mod secrets;
pub mod sigv4;
pub mod store;
pub mod subscriptions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            store::init(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine::execute_request,
            engine::cancel_request,
            resolve::resolve_and_send,
            resolve::resolve_preview_curl,
            interp::preview_template,
            store::list_collections,
            store::upsert_collection,
            store::delete_collection,
            store::list_requests,
            store::upsert_request,
            store::delete_request,
            store::list_environments,
            store::upsert_environment,
            store::delete_environment,
            store::get_active_environment_id,
            store::set_active_environment,
            store::history_list,
            store::history_clear,
            store::gql_schema_get,
            store::gql_schema_put,
            store::snapshot_get,
            store::snapshot_put,
            store::snapshot_delete,
            secrets::secret_set,
            secrets::secret_exists,
            secrets::secret_delete,
            curlgen::to_curl,
            curlgen::from_curl,
            importers::import_postman,
            importers::import_insomnia,
            importers::import_har,
            importers::import_http_file,
            importers::scan_shell_history_curls,
            subscriptions::subscription_start,
            subscriptions::subscription_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
