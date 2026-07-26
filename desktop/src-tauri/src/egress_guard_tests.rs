use super::*;

/// NIP-49 spec vector — a real ncryptsec blob for injection payloads.
const NCRYPTSEC: &str = "ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p";

fn assert_guard_error(err: &str) {
    assert!(
        err.contains("key-backup material"),
        "expected the egress-guard error, got: {err}"
    );
}

// ── Guard unit behavior ───────────────────────────────────────────────────────

#[test]
fn rejects_ncryptsec_anywhere_in_text() {
    assert_guard_error(&assert_no_key_backup(NCRYPTSEC, "test").unwrap_err());
    assert_guard_error(
        &assert_no_key_backup(
            &format!("{{\"content\":\"my backup: {NCRYPTSEC}\"}}"),
            "test",
        )
        .unwrap_err(),
    );
}

#[test]
fn passes_clean_payloads_including_raw_nsec() {
    assert!(assert_no_key_backup("hello world", "test").is_ok());
    assert!(assert_no_key_backup("", "test").is_ok());
    // Scope is ncryptsec1 ONLY: raw nsec intentionally transits the encrypted
    // pairing session and must NOT be blocked (plan D4 / pairing.rs).
    let nsec = nostr::ToBech32::to_bech32(nostr::Keys::generate().secret_key()).unwrap();
    assert!(assert_no_key_backup(&nsec, "test").is_ok());
    // Near-miss prefixes are not blocked.
    assert!(assert_no_key_backup("ncryptsec", "test").is_ok());
}

#[test]
fn byte_variant_matches_text_variant() {
    assert_guard_error(&assert_no_key_backup_bytes(NCRYPTSEC.as_bytes(), "test").unwrap_err());
    assert!(assert_no_key_backup_bytes(b"clean body", "test").is_ok());
    // Invalid UTF-8 around an intact ncryptsec substring must still trip the
    // guard (from_utf8_lossy preserves the ASCII run).
    let mut body = vec![0xff, 0xfe];
    body.extend_from_slice(NCRYPTSEC.as_bytes());
    body.push(0xff);
    assert_guard_error(&assert_no_key_backup_bytes(&body, "test").unwrap_err());
}

#[test]
fn error_names_the_boundary_context() {
    let err = assert_no_key_backup(NCRYPTSEC, "huddle STT publish").unwrap_err();
    assert!(err.contains("huddle STT publish"), "{err}");
}

// ── Runtime injection per boundary ────────────────────────────────────────────
//
// Each test drives the real production function with an ncryptsec-bearing
// payload and asserts the guard aborts the operation before any network I/O
// (no listener exists at the target address; a distinctive guard error — not
// a connection error — proves the abort happened first).
//
// Boundaries 6 and 7 (`submit_engram_event` twins) are module-private inside
// `commands`; their injection tests live next to them:
//   - commands/team_snapshot/tests.rs::egress_guard_boundary
//   - commands/personas/snapshot/import.rs::egress_guard_tests

/// Boundary 1: `relay/submit.rs` `submit_event_at_with_keys` (the funnel for
/// all `submit_event*` variants).
#[tokio::test]
async fn boundary_submit_event_at_with_keys_blocks_ncryptsec() {
    let state = crate::app_state::build_app_state();
    let keys = nostr::Keys::generate();
    let builder = nostr::EventBuilder::new(nostr::Kind::Custom(9), NCRYPTSEC);
    let err = crate::relay::submit_event_at_with_keys(
        builder,
        &state,
        "http://127.0.0.1:9", // discard port — must never be reached
        &keys,
    )
    .await
    .unwrap_err();
    assert_guard_error(&err);
}

/// Boundary 2: `relay.rs` `sync_managed_agent_profile` (agent kind:0 profile).
#[tokio::test]
async fn boundary_sync_managed_agent_profile_blocks_ncryptsec() {
    let state = crate::app_state::build_app_state();
    let keys = nostr::Keys::generate();
    let err = crate::relay::sync_managed_agent_profile(
        &state,
        "ws://127.0.0.1:9",
        &keys,
        &format!("agent {NCRYPTSEC}"),
        None,
        None,
    )
    .await
    .unwrap_err();
    assert_guard_error(&err);
}

/// Boundary 3: `relay.rs` `submit_signed_event`.
#[tokio::test]
async fn boundary_submit_signed_event_blocks_ncryptsec() {
    let state = crate::app_state::build_app_state();
    *state.relay_url_override.lock().unwrap() = Some("ws://127.0.0.1:9".to_string());
    let keys = state.signing_keys().unwrap();
    let event = nostr::EventBuilder::new(nostr::Kind::Custom(9), NCRYPTSEC)
        .sign_with_keys(&keys)
        .unwrap();
    let err = crate::relay::submit_signed_event(&event, &state)
        .await
        .unwrap_err();
    assert_guard_error(&err);
}

/// Boundary 4: `relay.rs` `submit_signed_event_with_keys`.
#[tokio::test]
async fn boundary_submit_signed_event_with_keys_blocks_ncryptsec() {
    let state = crate::app_state::build_app_state();
    *state.relay_url_override.lock().unwrap() = Some("ws://127.0.0.1:9".to_string());
    let keys = nostr::Keys::generate();
    let event = nostr::EventBuilder::new(nostr::Kind::Custom(9), NCRYPTSEC)
        .sign_with_keys(&keys)
        .unwrap();
    let err = crate::relay::submit_signed_event_with_keys(&event, &state, &keys, None)
        .await
        .unwrap_err();
    assert_guard_error(&err);
}

/// Boundary 5: huddle STT publisher (`huddle/pipeline.rs`).
#[test]
fn boundary_huddle_stt_blocks_ncryptsec() {
    let keys = nostr::Keys::generate();
    let channel = uuid::Uuid::new_v4();
    let builder =
        crate::events::build_message(channel, NCRYPTSEC, None, &[], &[], &[], &[]).unwrap();
    let err = crate::huddle::pipeline::sign_and_guard_stt_body(builder, &keys).unwrap_err();
    assert_guard_error(&err);

    // Clean transcripts pass through the same seam.
    let builder =
        crate::events::build_message(channel, "hello huddle", None, &[], &[], &[], &[]).unwrap();
    assert!(crate::huddle::pipeline::sign_and_guard_stt_body(builder, &keys).is_ok());
}

/// Boundary 8: native websocket send loop — the single choke point for all
/// webview-originated relay websocket frames.
#[tokio::test]
async fn boundary_native_websocket_blocks_ncryptsec() {
    let manager = crate::native_websocket::WebSocketManager::default();
    // Text frame: guard fires before the connection lookup, so no connection
    // is needed — and the error must be the guard's, not "not found".
    let err = crate::native_websocket::send_message(
        &manager,
        1,
        crate::native_websocket::WebSocketMessage::Text(format!(
            "[\"EVENT\",{{\"content\":\"{NCRYPTSEC}\"}}]"
        )),
    )
    .await
    .unwrap_err();
    assert_guard_error(&err);

    // Binary frame variant.
    let err = crate::native_websocket::send_message(
        &manager,
        1,
        crate::native_websocket::WebSocketMessage::Binary(NCRYPTSEC.as_bytes().to_vec()),
    )
    .await
    .unwrap_err();
    assert_guard_error(&err);

    // Clean frames fall through to normal handling ("connection not found"
    // here — the guard did not reject them).
    let err = crate::native_websocket::send_message(
        &manager,
        1,
        crate::native_websocket::WebSocketMessage::Text("[\"REQ\",\"sub\",{}]".to_string()),
    )
    .await
    .unwrap_err();
    assert!(err.contains("not found"), "{err}");
}

// ── Structural tripwires ──────────────────────────────────────────────────────

fn src_rust_files() -> Vec<std::path::PathBuf> {
    fn walk(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                out.push(path);
            }
        }
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut out = Vec::new();
    walk(&root, &mut out);
    out
}

/// Inventory completeness: every `/events` URL-construction site in
/// `desktop/src-tauri/src` must be in the guarded set. A future ninth
/// submission path fails this test until its guard is wired and it is added
/// to the allowlist below (with its egress_guard.rs table row + injection
/// test).
#[test]
fn events_url_inventory_is_fully_guarded() {
    // (file suffix, guarded construction sites expected in that file)
    let allowlist: &[&str] = &[
        "src/relay.rs",                             // boundaries 2, 3, 4
        "src/relay/submit.rs",                      // boundary 1
        "src/huddle/pipeline.rs",                   // boundary 5
        "src/commands/team_snapshot.rs",            // boundary 6
        "src/commands/personas/snapshot/import.rs", // boundary 7
        // test-only relay stubs / fixtures (no production egress):
        "src/relay_admission.rs",
        "src/archive/mod_tests.rs",
        "src/managed_agents/persona_events/tests.rs",
        "src/commands/team_snapshot/tests.rs",
        "src/egress_guard_tests.rs",
    ];

    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut violations = Vec::new();
    for path in src_rust_files() {
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let content = std::fs::read_to_string(&path).unwrap();
        for (i, line) in content.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") {
                continue; // doc/comment mentions
            }
            if line.contains("/events") && !allowlist.iter().any(|a| rel.ends_with(a)) {
                violations.push(format!("{rel}:{}: {}", i + 1, line.trim()));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "new `/events` egress site(s) outside the guarded inventory — wire \
         crate::egress_guard and add an injection test before allowlisting:\n{}",
        violations.join("\n")
    );
}

/// Source allowlist: NIP-49 material handling is confined to the identity /
/// backup / import / guard files. Anything else touching ncryptsec or the
/// nip49 codec is structural drift.
#[test]
fn ncryptsec_handling_is_confined_to_allowlisted_files() {
    let allowlist: &[&str] = &[
        "src/key_backup.rs",
        "src/key_backup_tests.rs",
        "src/egress_guard.rs",
        "src/egress_guard_tests.rs",
        "src/commands/identity.rs",
        "src/lib.rs", // module registration + invoke handler
        // boundary wiring (guard call sites name the module, not the codec):
        "src/relay.rs",
        "src/relay/submit.rs",
        "src/huddle/pipeline.rs",
        "src/commands/team_snapshot.rs",
        "src/commands/team_snapshot/tests.rs",
        "src/commands/personas/snapshot/import.rs",
        "src/native_websocket.rs",
    ];

    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut violations = Vec::new();
    for path in src_rust_files() {
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if allowlist.iter().any(|a| rel.ends_with(a)) {
            continue;
        }
        let content = std::fs::read_to_string(&path).unwrap();
        for needle in ["ncryptsec", "EncryptedSecretKey", "nip49"] {
            if content.contains(needle) {
                violations.push(format!("{rel}: contains {needle:?}"));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "NIP-49 material outside allowlisted files:\n{}",
        violations.join("\n")
    );
}
